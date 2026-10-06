import type { Db } from '@pkg/db';
import { contractingTranscriptionHints, contractingTranscriptions } from '@pkg/db/contracting';
import { validateFile } from '@pkg/domain';
import {
  isHintDerivationLanguage,
  TRANSCRIPTION_HINT_CAP,
  transcriptionWasCorrected,
  VOICE_NOTE_POLICY,
} from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import { type HintDerivation, Transcription, TranscriptionSavedInput } from '@pkg/schema/contracting';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { FilePolicyViolationError } from '../../files/file-errors.js';
import { TranscriptionError } from './transcription-errors.js';

export type VoiceTranscript = { text: string; language: string | null };
export type ActiveHint = { id: string; rule: string };

/** The speech service and the language model behind a Voice Note, injected by the API. */
export type TranscriptionEngine = {
  transcribe: (input: { audio: Uint8Array; keyterms: readonly string[] }) => Promise<VoiceTranscript>;
  tidy: (input: {
    rawText: string;
    language: string | null;
    purpose: string;
    hints: readonly ActiveHint[];
  }) => Promise<string>;
  derive: (input: {
    rawText: string;
    shownText: string;
    savedText: string;
    language: string | null;
    purpose: string;
    hints: readonly ActiveHint[];
  }) => Promise<HintDerivation>;
};

const activeHint = isNull(contractingTranscriptionHints.retiredAt);
const derivationDue = (row: { language: string | null; shownText: string; savedText: string | null }) =>
  row.savedText !== null &&
  isHintDerivationLanguage(row.language) &&
  transcriptionWasCorrected(row.shownText, row.savedText);

/** The Transcription Hints in force, oldest first. */
export async function listActiveHints({ db }: { db: Db }): Promise<(ActiveHint & { keyterm: string | null })[]> {
  return db
    .select({
      id: contractingTranscriptionHints.id,
      rule: contractingTranscriptionHints.rule,
      keyterm: contractingTranscriptionHints.keyterm,
    })
    .from(contractingTranscriptionHints)
    .where(activeHint)
    .orderBy(asc(contractingTranscriptionHints.createdAt), asc(contractingTranscriptionHints.id));
}

/** Turns a Voice Note into text. The recording is never stored; the Transcription row keeps what was heard and shown. */
export async function transcribeVoiceNote({
  db,
  actorUserId,
  audio,
  purpose,
  engine,
  keyterms,
}: {
  db: Db;
  actorUserId: AuthId;
  audio: Uint8Array;
  purpose: string;
  engine: TranscriptionEngine;
  keyterms: () => Promise<string[]>;
}): Promise<Transcription> {
  const validation = validateFile(audio, VOICE_NOTE_POLICY);
  if (!validation.ok) throw new FilePolicyViolationError(validation);
  const hints = await listActiveHints({ db });
  let heard: VoiceTranscript;
  try {
    heard = await engine.transcribe({ audio, keyterms: await keyterms() });
  } catch (error) {
    throw new TranscriptionError(
      'transcription.unavailable',
      'Transcription is unavailable right now. Type the note instead.',
      { cause: error },
    );
  }
  if (heard.text === '')
    throw new TranscriptionError(
      'transcription.unavailable',
      'Nothing was heard. Try again closer to the phone, or type the note.',
    );
  // The tidy pass is best effort: if it fails, the raw text is what the person sees.
  const shown = await engine
    .tidy({ rawText: heard.text, language: heard.language, purpose, hints })
    .then((text) => text || heard.text)
    .catch(() => heard.text);
  const [row] = await db
    .insert(contractingTranscriptions)
    .values({ createdByUserId: actorUserId, purpose, language: heard.language, rawText: heard.text, shownText: shown })
    .returning({ id: contractingTranscriptions.id });
  return Transcription.parse({ id: row?.id, text: shown, language: heard.language });
}

/** Stamps what the person kept. Returns whether a hint derivation is due, so the API can schedule it after the response. */
export async function recordTranscriptionSaved({
  db,
  actorUserId,
  input: raw,
  now = new Date(),
}: {
  db: Db;
  actorUserId: AuthId;
  input: TranscriptionSavedInput;
  now?: Date;
}): Promise<{ id: string; deriveHint: boolean }> {
  const input = TranscriptionSavedInput.parse(raw);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contractingTranscriptions)
      .where(eq(contractingTranscriptions.id, input.id))
      .for('update');
    if (!row) throw new TranscriptionError('transcription.not_found', 'Transcription not found.');
    if (row.createdByUserId !== actorUserId)
      throw new TranscriptionError('transcription.forbidden', 'This voice note belongs to someone else.');
    if (row.savedAt) throw new TranscriptionError('transcription.already_saved', 'This voice note was already saved.');
    await tx
      .update(contractingTranscriptions)
      .set({ savedText: input.text, savedAt: now })
      .where(eq(contractingTranscriptions.id, row.id));
    return { id: row.id, deriveHint: derivationDue({ ...row, savedText: input.text }) };
  });
}

/** One derivation per stamped Transcription, as the System, after the save has answered. Idempotent on hintDerivedAt. */
export async function deriveHintFor({
  db,
  id,
  engine,
  now = new Date(),
}: {
  db: Db;
  id: string;
  engine: Pick<TranscriptionEngine, 'derive'>;
  now?: Date;
}): Promise<HintDerivation | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(contractingTranscriptions)
      .where(eq(contractingTranscriptions.id, id))
      .for('update');
    if (!row || row.savedText === null || row.hintDerivedAt || !derivationDue(row)) return null;
    const hints = await tx
      .select({ id: contractingTranscriptionHints.id, rule: contractingTranscriptionHints.rule })
      .from(contractingTranscriptionHints)
      .where(activeHint)
      .orderBy(asc(contractingTranscriptionHints.createdAt), asc(contractingTranscriptionHints.id))
      .for('update');
    const outcome = await engine.derive({
      rawText: row.rawText,
      shownText: row.shownText,
      savedText: row.savedText,
      language: row.language,
      purpose: row.purpose,
      hints,
    });
    if (outcome.action === 'add') {
      // A retirement the model names counts only when it is a hint still in force.
      const superseded = hints.find((hint) => hint.id === outcome.retireHintId) ?? null;
      const remaining = hints.filter((hint) => hint !== superseded);
      const crowdedOut = remaining.slice(0, Math.max(0, remaining.length - TRANSCRIPTION_HINT_CAP + 1));
      const retiring = [...(superseded ? [superseded] : []), ...crowdedOut].map((hint) => hint.id);
      if (retiring.length > 0)
        await tx
          .update(contractingTranscriptionHints)
          .set({ retiredAt: now })
          .where(inArray(contractingTranscriptionHints.id, retiring));
      const [added] = await tx
        .insert(contractingTranscriptionHints)
        .values({ rule: outcome.rule, keyterm: outcome.keyterm, sourceTranscriptionId: row.id, createdAt: now })
        .returning({ id: contractingTranscriptionHints.id });
      if (superseded && added)
        await tx
          .update(contractingTranscriptionHints)
          .set({ supersededByHintId: added.id })
          .where(eq(contractingTranscriptionHints.id, superseded.id));
    }
    await tx
      .update(contractingTranscriptions)
      .set({ hintDerivedAt: now })
      .where(eq(contractingTranscriptions.id, row.id));
    return outcome;
  });
}

/** Stamped Transcriptions whose hint derivation never ran, for the API to resume on start. */
export async function listTranscriptionsAwaitingHints({ db }: { db: Db }): Promise<string[]> {
  const rows = await db
    .select({
      id: contractingTranscriptions.id,
      language: contractingTranscriptions.language,
      shownText: contractingTranscriptions.shownText,
      savedText: contractingTranscriptions.savedText,
    })
    .from(contractingTranscriptions)
    .where(
      and(
        isNotNull(contractingTranscriptions.savedAt),
        isNull(contractingTranscriptions.hintDerivedAt),
        sql`btrim(${contractingTranscriptions.savedText}) NOT IN ('', btrim(${contractingTranscriptions.shownText}))`,
      ),
    )
    .orderBy(asc(contractingTranscriptions.savedAt));
  return rows.filter(derivationDue).map((row) => row.id);
}
