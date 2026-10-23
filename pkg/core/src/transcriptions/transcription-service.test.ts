import { type Db, transcriptionHints, transcriptions, user } from '@pkg/db';
import { TRANSCRIPTION_HINT_CAP } from '@pkg/domain';
import type { Business, HintDerivation, KeytermCandidate } from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../test/create-tester.js';
import {
  deriveHintFor,
  listActiveHints,
  listTranscriptionsAwaitingHints,
  loadKeytermCandidates,
  recordTranscriptionSaved,
  type TranscriptionEngine,
  transcribeVoiceNote,
} from './transcription-service.js';

const ROOIKRAAL: KeytermCandidate = { keyterm: 'Rooikraal', source: 'hint' };
const M4A = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

function engineHearing(
  heard: { text: string; language: string | null },
  derivation: HintDerivation = { action: 'none', reason: 'No rule.' },
) {
  const calls = { keyterms: [] as (readonly KeytermCandidate[])[], derive: 0 };
  const engine: TranscriptionEngine = {
    transcribe: async ({ keyterms }) => {
      calls.keyterms.push(keyterms);
      return heard;
    },
    tidy: async ({ rawText }) => ({ text: `${rawText[0]?.toUpperCase()}${rawText.slice(1)}.`, language: 'en' }),
    derive: async () => {
      calls.derive += 1;
      return derivation;
    },
  };
  return { engine, calls };
}

const foremanId = 'transcription-speaker';
const adminId = 'transcription-other';

const test = createTester(async ({ db }) => {
  const now = new Date();
  await db.insert(user).values(
    [foremanId, adminId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    })),
  );
  return {};
});

async function noted(
  db: Db,
  heard: { text: string; language: string | null },
  derivation?: HintDerivation,
  business: Business = 'contracting',
) {
  const { engine, calls } = engineHearing(heard, derivation);
  const transcription = await transcribeVoiceNote({
    db,
    actorUserId: foremanId,
    audio: M4A,
    business,
    purpose: 'capture comment',
    setting: 'a test note',
    engine,
    keyterms: async () => [ROOIKRAAL],
  });
  return { transcription, engine, calls };
}

test('keeps what was heard, shown and its language, and stamps only the speaker’s first save', async ({
  context: { db },
}) => {
  // The speech model named no language, so the tidy pass's tag is kept.
  const { transcription, calls } = await noted(db, { text: 'the gate at rooi kraal is open', language: null });

  expect(transcription).toEqual({ id: expect.any(String), text: 'The gate at rooi kraal is open.', language: 'en' });
  expect(calls.keyterms).toEqual([[ROOIKRAAL]]);
  const input = {
    business: 'contracting' as const,
    id: transcription.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'capture comment',
  };
  await expect(recordTranscriptionSaved({ db, actorUserId: adminId, input })).rejects.toMatchObject({
    code: 'transcription.forbidden',
  });
  expect(await recordTranscriptionSaved({ db, actorUserId: foremanId, input })).toEqual({
    id: transcription.id,
    deriveHint: true,
  });
  await expect(recordTranscriptionSaved({ db, actorUserId: foremanId, input })).rejects.toMatchObject({
    code: 'transcription.already_saved',
  });
  expect(await db.query.transcriptions.findFirst({ where: eq(transcriptions.id, transcription.id) })).toMatchObject({
    rawText: 'the gate at rooi kraal is open',
    shownText: 'The gate at rooi kraal is open.',
    savedText: 'The gate at Rooikraal is open.',
    savedAt: expect.any(Date),
  });
});

test('refuses audio that is not M4A and says when nothing was heard', async ({ context: { db } }) => {
  const { engine } = engineHearing({ text: '', language: null });
  const transcribe = (audio: Uint8Array) =>
    transcribeVoiceNote({
      db,
      actorUserId: foremanId,
      audio,
      business: 'contracting',
      purpose: 'field note',
      setting: 'a test note',
      engine,
      keyterms: async () => [],
    });

  await expect(transcribe(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).rejects.toMatchObject({
    code: 'file.content_type_not_allowed',
  });
  await expect(transcribe(M4A)).rejects.toMatchObject({ code: 'transcription.nothing_heard' });
});

test('derives nothing from Afrikaans notes or from a save that kept the shown text', async ({ context: { db } }) => {
  const afrikaans = await noted(db, { text: 'die hek by rooi kraal is oop', language: 'afr' });
  const kept = await noted(db, { text: 'the gate is open', language: 'eng' });

  const saved = await Promise.all([
    recordTranscriptionSaved({
      db,
      actorUserId: foremanId,
      input: {
        business: 'contracting',
        id: afrikaans.transcription.id,
        text: 'Die hek by Rooikraal is oop.',
        purpose: 'capture comment',
      },
    }),
    recordTranscriptionSaved({
      db,
      actorUserId: foremanId,
      input: {
        business: 'contracting',
        id: kept.transcription.id,
        text: ' The gate is open. ',
        purpose: 'capture comment',
      },
    }),
  ]);

  expect(saved.map((result) => result.deriveHint)).toEqual([false, false]);
  expect(await listTranscriptionsAwaitingHints({ db })).toEqual([]);
  expect(await deriveHintFor({ db, id: afrikaans.transcription.id, engine: afrikaans.engine })).toBeNull();
  expect(afrikaans.calls.derive).toBe(0);
});

async function derivedFrom(db: Db, derivation: HintDerivation, business: Business = 'contracting') {
  const { transcription, engine, calls } = await noted(
    db,
    { text: "at barsey's farm heading to stony brook", language: 'eng' },
    derivation,
    business,
  );
  await recordTranscriptionSaved({
    db,
    actorUserId: foremanId,
    input: {
      business,
      id: transcription.id,
      text: "At Bassi's Farm, heading to Stoneybrook.",
      purpose: 'capture comment',
    },
  });
  return { derive: () => deriveHintFor({ db, id: transcription.id, engine }), transcription, calls };
}

const findHint = (db: Db, id: string | undefined) =>
  db.query.transcriptionHints.findFirst({ where: eq(transcriptionHints.id, id ?? '') });

test('one correction teaches a hint per fix, all from the same Transcription, once', async ({ context: { db } }) => {
  const { derive, transcription, calls } = await derivedFrom(db, {
    action: 'add',
    hints: [
      { rule: "The farm is spelled Bassi's, not Barsey's.", keyterm: "Bassi's Farm", retireHintId: null },
      { rule: 'Stoneybrook is one word.', keyterm: 'Stoneybrook', retireHintId: null },
    ],
  });

  expect(await listTranscriptionsAwaitingHints({ db })).toEqual([transcription.id]);

  await derive();
  await derive();

  expect(calls.derive).toBe(1);
  expect(await listTranscriptionsAwaitingHints({ db })).toEqual([]);
  const added = await db.query.transcriptionHints.findMany();
  expect(added).toHaveLength(2);
  expect(added).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ keyterm: "Bassi's Farm", sourceTranscriptionId: transcription.id }),
      expect.objectContaining({ keyterm: 'Stoneybrook', sourceTranscriptionId: transcription.id }),
    ]),
  );
  expect(added[0]?.createdAt).toEqual(added[1]?.createdAt);
  expect(await db.query.transcriptions.findFirst({ where: eq(transcriptions.id, transcription.id) })).toMatchObject({
    hintDerivedAt: expect.any(Date),
    hintOutcome: 'added',
  });
});

test('each new hint retires the one it names, and a hint named twice is retired once for the first', async ({
  context: { db },
}) => {
  const [farm, brook, kept] = await db
    .insert(transcriptionHints)
    .values(
      ['Barsey is a farm.', 'Stony Brook is two words.', 'Say Code Red.'].map((rule) => ({
        business: 'contracting' as const,
        rule,
      })),
    )
    .returning();
  const { derive } = await derivedFrom(db, {
    action: 'add',
    hints: [
      { rule: "The farm is spelled Bassi's.", keyterm: "Bassi's Farm", retireHintId: farm?.id ?? null },
      { rule: 'Stoneybrook is one word.', keyterm: 'Stoneybrook', retireHintId: brook?.id ?? null },
      { rule: 'Bassi is a surname too.', keyterm: 'Bassi', retireHintId: farm?.id ?? null },
    ],
  });

  await derive();

  const active = await listActiveHints({ db, business: 'contracting' });
  const successor = (keyterm: string) => active.find((hint) => hint.keyterm === keyterm)?.id;
  expect(active).toHaveLength(4);
  expect(await findHint(db, farm?.id)).toMatchObject({
    retiredAt: expect.any(Date),
    supersededByHintId: successor("Bassi's Farm"),
  });
  expect(await findHint(db, brook?.id)).toMatchObject({
    retiredAt: expect.any(Date),
    supersededByHintId: successor('Stoneybrook'),
  });
  expect(await findHint(db, kept?.id)).toMatchObject({ retiredAt: null });
});

test('a full hint list retires its oldest hints to make room, never a new one', async ({ context: { db } }) => {
  await db.insert(transcriptionHints).values(
    Array.from({ length: TRANSCRIPTION_HINT_CAP }, (_, index) => ({
      business: 'contracting' as const,
      rule: `Rule ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    })),
  );
  const { derive } = await derivedFrom(db, {
    action: 'add',
    hints: [
      { rule: "The farm is spelled Bassi's.", keyterm: "Bassi's Farm", retireHintId: null },
      { rule: 'Stoneybrook is one word.', keyterm: 'Stoneybrook', retireHintId: null },
    ],
  });

  await derive();

  const active = await listActiveHints({ db, business: 'contracting' });
  expect(active).toHaveLength(TRANSCRIPTION_HINT_CAP);
  expect(active[0]?.rule).toBe('Rule 2');
  expect(active.slice(-2).map((hint) => hint.keyterm)).toEqual(expect.arrayContaining(["Bassi's Farm", 'Stoneybrook']));
});

test('each business keeps its own Transcriptions and hint pool', async ({ context: { db } }) => {
  await db.insert(transcriptionHints).values(
    Array.from({ length: TRANSCRIPTION_HINT_CAP }, (_, index) => ({
      business: 'contracting' as const,
      rule: `Contracting rule ${index}`,
      keyterm: index === 0 ? 'Rooikraal' : null,
    })),
  );
  const { derive, transcription } = await derivedFrom(
    db,
    { action: 'add', hints: [{ rule: 'Spell it Bloemhof.', keyterm: 'Bloemhof', retireHintId: null }] },
    'equipment',
  );

  expect(await derive()).toMatchObject({ business: 'equipment', outcome: { action: 'add' } });
  // The Contracting pool is full, but an Equipment hint crowds out none of it.
  expect(await listActiveHints({ db, business: 'contracting' })).toHaveLength(TRANSCRIPTION_HINT_CAP);
  expect(await listActiveHints({ db, business: 'equipment' })).toEqual([
    expect.objectContaining({ rule: 'Spell it Bloemhof.', keyterm: 'Bloemhof' }),
  ]);
  expect(await db.query.transcriptions.findFirst({ where: eq(transcriptions.id, transcription.id) })).toMatchObject({
    business: 'equipment',
  });
  await expect(
    recordTranscriptionSaved({
      db,
      actorUserId: foremanId,
      input: { business: 'contracting', id: transcription.id, text: 'Again.', purpose: 'capture comment' },
    }),
  ).rejects.toMatchObject({ code: 'transcription.not_found' });
});

test("a business's keyterms are its taught hint keyterms, then its profile's vocabulary", async ({
  context: { db },
}) => {
  await db.insert(transcriptionHints).values([
    { business: 'contracting', rule: 'Spell it Bloemhof.', keyterm: 'Bloemhof' },
    { business: 'contracting', rule: 'Old rule.', keyterm: 'Vaalkop', retiredAt: new Date() },
    { business: 'contracting', rule: 'A meaning, not a name.', keyterm: null },
    { business: 'equipment', rule: 'Spell it Bossies.', keyterm: 'Bossies' },
  ]);
  const profile = { loadKeytermCandidates: async () => [{ keyterm: 'CAT320-1', source: 'machine' }] };

  expect(await loadKeytermCandidates({ db, business: 'contracting', profile })).toEqual([
    { keyterm: 'Bloemhof', source: 'hint' },
    { keyterm: 'CAT320-1', source: 'machine' },
  ]);
  expect(await loadKeytermCandidates({ db, business: 'equipment', profile })).toEqual([
    { keyterm: 'Bossies', source: 'hint' },
    { keyterm: 'CAT320-1', source: 'machine' },
  ]);
});
