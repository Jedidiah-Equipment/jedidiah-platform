import { type Db, transcriptionHints, transcriptions } from '@pkg/db';
import {
  isHintDerivationLanguage,
  TRANSCRIPTION_HINT_CAP,
  transcriptionWasCorrected,
  VOICE_NOTE_POLICY,
  validateFile,
} from '@pkg/domain';
import {
  type AuthId,
  type Business,
  type HintDerivation,
  type KeytermCandidate,
  Transcription,
  TranscriptionSavedInput,
} from '@pkg/schema';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { filePolicyViolation } from '../files/file-errors.js';
import { TranscriptionError } from './transcription-errors.js';
import type { TranscriptionProfile } from './transcription-profile.js';

export type VoiceTranscript = { text: string; language: string | null };
export type ActiveHint = { id: string; rule: string };

/** The speech service and the language model behind a Voice Note, injected by the API. */
export type TranscriptionEngine = {
  transcribe: (input: { audio: Uint8Array; keyterms: readonly KeytermCandidate[] }) => Promise<VoiceTranscript>;
  tidy: (input: {
    /** Where the note was spoken, from the business's profile. */
    setting: string;
    rawText: string;
    language: string | null;
    purpose: string;
    hints: readonly ActiveHint[];
  }) => Promise<VoiceTranscript>;
  derive: (input: {
    rawText: string;
    shownText: string;
    savedText: string;
    language: string | null;
    purpose: string;
    hints: readonly ActiveHint[];
  }) => Promise<HintDerivation>;
};

/** A hint in force in this business's pool; the pools never mix. */
const activeHint = (business: Business) =>
  and(eq(transcriptionHints.business, business), isNull(transcriptionHints.retiredAt));
const languageTag = (language: string | null) => {
  const tag = language?.trim().toLowerCase() ?? '';
  return /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/.test(tag) ? tag : null;
};
const derivationDue = (row: { language: string | null; shownText: string; savedText: string | null }) =>
  row.savedText !== null &&
  isHintDerivationLanguage(row.language) &&
  transcriptionWasCorrected(row.shownText, row.savedText);

/** One business's Transcription Hints in force, oldest first. */
export async function listActiveHints({
  db,
  business,
}: {
  db: Db;
  business: Business;
}): Promise<(ActiveHint & { keyterm: string | null })[]> {
  return db
    .select({ id: transcriptionHints.id, rule: transcriptionHints.rule, keyterm: transcriptionHints.keyterm })
    .from(transcriptionHints)
    .where(activeHint(business))
    .orderBy(asc(transcriptionHints.createdAt), asc(transcriptionHints.id));
}

/**
 * The keyterms one business's speech calls are biased by: its taught hint keyterms first, so the cap never crowds
 * out a correction someone taught, then its profile's vocabulary.
 */
export async function loadKeytermCandidates({
  db,
  business,
  profile,
  now,
}: {
  db: Db;
  business: Business;
  profile: Pick<TranscriptionProfile, 'loadKeytermCandidates'>;
  now?: Date;
}): Promise<KeytermCandidate[]> {
  const [taught, vocabulary] = await Promise.all([
    db
      .select({ keyterm: transcriptionHints.keyterm })
      .from(transcriptionHints)
      .where(and(activeHint(business), isNotNull(transcriptionHints.keyterm)))
      .orderBy(asc(transcriptionHints.createdAt), asc(transcriptionHints.id)),
    profile.loadKeytermCandidates(now ? { db, now } : { db }),
  ]);
  return [...taught.flatMap(({ keyterm }) => (keyterm === null ? [] : [{ keyterm, source: 'hint' }])), ...vocabulary];
}

/** Turns a Voice Note into text. The recording is never stored; the Transcription row keeps what was heard and shown. */
export async function transcribeVoiceNote({
  db,
  actorUserId,
  audio,
  business,
  purpose,
  setting,
  engine,
  keyterms,
}: {
  db: Db;
  actorUserId: AuthId;
  audio: Uint8Array;
  business: Business;
  purpose: string;
  setting: string;
  engine: TranscriptionEngine;
  keyterms: () => Promise<KeytermCandidate[]>;
}): Promise<Transcription> {
  const validation = validateFile(audio, VOICE_NOTE_POLICY);
  if (!validation.ok) throw filePolicyViolation(validation);
  const hints = await listActiveHints({ db, business });
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
      'transcription.nothing_heard',
      'Nothing was heard. Try again closer to the phone, or type the note.',
    );
  // The tidy pass is best effort: if it fails, the raw text is what the person sees.
  const tidied = await engine
    .tidy({ setting, rawText: heard.text, language: heard.language, purpose, hints })
    .catch(() => ({ text: '', language: null }));
  const shown = tidied.text || heard.text;
  // The speech model may name no language; the tidy pass's guess then stands in, so the hint gate still works.
  const language = languageTag(heard.language) ?? languageTag(tidied.language);
  const [row] = await db
    .insert(transcriptions)
    .values({ business, createdByUserId: actorUserId, purpose, language, rawText: heard.text, shownText: shown })
    .returning({ id: transcriptions.id });
  return Transcription.parse({ id: row?.id, text: shown, language });
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
    const [row] = await tx.select().from(transcriptions).where(eq(transcriptions.id, input.id)).for('update');
    // Another business's Transcription answers as a missing one, so its pool cannot be probed from this one.
    if (!row || row.business !== input.business)
      throw new TranscriptionError('transcription.not_found', 'Transcription not found.');
    if (row.createdByUserId !== actorUserId)
      throw new TranscriptionError('transcription.forbidden', 'This voice note belongs to someone else.');
    if (row.savedAt) throw new TranscriptionError('transcription.already_saved', 'This voice note was already saved.');
    await tx.update(transcriptions).set({ savedText: input.text, savedAt: now }).where(eq(transcriptions.id, row.id));
    return { id: row.id, deriveHint: derivationDue({ ...row, savedText: input.text }) };
  });
}

/**
 * One derivation per stamped Transcription, as the System, after the save has answered. Idempotent on hintDerivedAt.
 * The hints it reads, retires and adds are all in the Transcription's own business's pool.
 */
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
}): Promise<{ business: Business; outcome: HintDerivation } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(transcriptions).where(eq(transcriptions.id, id)).for('update');
    if (!row || row.savedText === null || row.hintDerivedAt || !derivationDue(row)) return null;
    const { business } = row;
    const hints = await tx
      .select({ id: transcriptionHints.id, rule: transcriptionHints.rule })
      .from(transcriptionHints)
      .where(activeHint(business))
      .orderBy(asc(transcriptionHints.createdAt), asc(transcriptionHints.id))
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
      // A retirement the model names counts only when it is a hint still in force, and only once.
      const superseding = new Map<string, number>();
      outcome.hints.forEach(({ retireHintId }, index) => {
        if (retireHintId && !superseding.has(retireHintId) && hints.some((hint) => hint.id === retireHintId))
          superseding.set(retireHintId, index);
      });
      const remaining = hints.filter((hint) => !superseding.has(hint.id));
      const crowdedOut = remaining.slice(
        0,
        Math.max(0, remaining.length - TRANSCRIPTION_HINT_CAP + outcome.hints.length),
      );
      const retiring = [...superseding.keys(), ...crowdedOut.map((hint) => hint.id)];
      if (retiring.length > 0)
        await tx.update(transcriptionHints).set({ retiredAt: now }).where(inArray(transcriptionHints.id, retiring));
      // One insert per hint keeps each new id beside the entry that names what it supersedes.
      const added: string[] = [];
      for (const { rule, keyterm } of outcome.hints) {
        const [hint] = await tx
          .insert(transcriptionHints)
          .values({ business, rule, keyterm, sourceTranscriptionId: row.id, createdAt: now })
          .returning({ id: transcriptionHints.id });
        if (hint) added.push(hint.id);
      }
      for (const [retiredId, index] of superseding) {
        const successorId = added[index];
        if (successorId)
          await tx
            .update(transcriptionHints)
            .set({ supersededByHintId: successorId })
            .where(eq(transcriptionHints.id, retiredId));
      }
    }
    await tx
      .update(transcriptions)
      .set({
        hintDerivedAt: now,
        hintOutcome: outcome.action === 'add' ? 'added' : 'none',
        hintNoneReason: outcome.action === 'none' ? outcome.reason : null,
      })
      .where(eq(transcriptions.id, row.id));
    return { business, outcome };
  });
}

/** Stamped Transcriptions whose hint derivation never ran, in every business, for the API to resume on start. */
export async function listTranscriptionsAwaitingHints({ db }: { db: Db }): Promise<string[]> {
  const rows = await db
    .select({
      id: transcriptions.id,
      language: transcriptions.language,
      shownText: transcriptions.shownText,
      savedText: transcriptions.savedText,
    })
    .from(transcriptions)
    .where(
      and(
        isNotNull(transcriptions.savedAt),
        isNull(transcriptions.hintDerivedAt),
        sql`btrim(${transcriptions.savedText}) NOT IN ('', btrim(${transcriptions.shownText}))`,
      ),
    )
    .orderBy(asc(transcriptions.savedAt));
  return rows.filter(derivationDue).map((row) => row.id);
}
