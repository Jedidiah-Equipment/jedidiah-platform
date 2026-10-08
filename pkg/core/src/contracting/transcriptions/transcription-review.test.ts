import { contractingTranscriptionHints } from '@pkg/db/contracting';
import { type HintDerivation, TranscriptionListInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { adminId, foremanId, seedJobFixtures } from '../test/job-fixtures.js';
import { listTranscriptionHints, listTranscriptionReviews, listTranscriptionUsers } from './transcription-review.js';
import {
  deriveHintFor,
  recordTranscriptionSaved,
  type TranscriptionEngine,
  transcribeVoiceNote,
} from './transcription-service.js';

const M4A = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

const listInput = (input: Partial<TranscriptionListInput>) => TranscriptionListInput.parse(input);

const test = createTester(async ({ db }) => ({ fixtures: await seedJobFixtures(db) }));

type Db = Parameters<typeof transcribeVoiceNote>[0]['db'];

async function note(
  db: Db,
  heard: { text: string; language: string },
  save?: string,
  derivation: HintDerivation = { action: 'none', reason: 'Specific to this note.' },
  actorUserId = foremanId,
) {
  const engine: TranscriptionEngine = {
    transcribe: async () => heard,
    tidy: async ({ rawText }) => ({ text: `${rawText}.`, language: heard.language }),
    derive: async () => derivation,
  };
  const transcription = await transcribeVoiceNote({
    db,
    actorUserId,
    audio: M4A,
    purpose: 'capture comment',
    engine,
    keyterms: async () => [],
  });
  if (save !== undefined)
    await recordTranscriptionSaved({
      db,
      actorUserId,
      input: { id: transcription.id, text: save, purpose: 'capture comment' },
    });
  return { id: transcription.id, derive: () => deriveHintFor({ db, id: transcription.id, engine }) };
}

test('shows each Transcription newest first with where its hint derivation stands', async ({ context: { db } }) => {
  const unsaved = await note(db, { text: 'gate open', language: 'en' });
  const kept = await note(db, { text: 'gate open', language: 'en' }, 'gate open.');
  const afrikaans = await note(db, { text: 'hek oop', language: 'af' }, 'Die hek is oop.');
  const pending = await note(db, { text: 'rooi kraal', language: 'en' }, 'Rooikraal.');
  const declined = await note(db, { text: 'pump at the dam', language: 'en' }, 'Pump at the top dam.');
  const added = await note(db, { text: 'bloem hof by vaal kop', language: 'en' }, 'Bloemhof by Vaalkop.', {
    action: 'add',
    hints: [
      { rule: 'Bloemhof is one word.', keyterm: 'Bloemhof', retireHintId: null },
      { rule: 'Vaalkop is one word.', keyterm: 'Vaalkop', retireHintId: null },
    ],
  });
  await declined.derive();
  await added.derive();

  const page = await listTranscriptionReviews({ db, input: listInput({ cursor: 0, limit: 5 }) });

  // The hint list is newest first, so creation order is its reverse.
  const hintIds = (await listTranscriptionHints({ db })).hints.map((hint) => hint.id).reverse();
  expect(hintIds).toHaveLength(2);
  expect(page).toMatchObject({ total: 6, nextCursor: 5 });
  expect(page.items.map((item) => [item.id, item.hintStatus])).toEqual([
    [added.id, { kind: 'hint_added', hintIds }],
    [declined.id, { kind: 'no_hint', reason: 'Specific to this note.' }],
    [pending.id, { kind: 'pending' }],
    [afrikaans.id, { kind: 'not_english' }],
    [kept.id, { kind: 'no_correction' }],
  ]);
  expect(page.items[1]).toMatchObject({
    createdByName: expect.any(String),
    rawText: 'pump at the dam',
    shownText: 'pump at the dam.',
    savedText: 'Pump at the top dam.',
  });
  expect((await listTranscriptionReviews({ db, input: listInput({ cursor: 5, limit: 5 }) })).items).toEqual([
    expect.objectContaining({ id: unsaved.id, hintStatus: { kind: 'not_saved' } }),
  ]);
});

test('filters by who recorded them, counts only those, and offers only people who have recorded', async ({
  context: { db },
}) => {
  const foremanNotes = [
    await note(db, { text: 'gate open', language: 'en' }),
    await note(db, { text: 'pump off', language: 'en' }),
  ];
  const adminNote = await note(db, { text: 'tipper fixed', language: 'en' }, undefined, undefined, adminId);

  const foreman = await listTranscriptionReviews({ db, input: listInput({ createdByUserIds: [foremanId], limit: 1 }) });
  const both = await listTranscriptionReviews({
    db,
    input: listInput({ createdByUserIds: [foremanId, adminId], sortDirection: 'asc' }),
  });

  expect(foreman).toMatchObject({ total: 2, nextCursor: 1, items: [{ id: foremanNotes[1]?.id }] });
  expect(both.items.map((item) => item.id)).toEqual([...foremanNotes.map((item) => item.id), adminNote.id]);
  expect((await listTranscriptionUsers({ db })).map((person) => person.id).sort()).toEqual([adminId, foremanId].sort());
});

test('lists hints in force first, each with its successor and the Transcription it came from', async ({
  context: { db },
}) => {
  const [older] = await db
    .insert(contractingTranscriptionHints)
    .values({ rule: 'Bloem Hof is two words.', createdAt: new Date(Date.UTC(2026, 0, 1)) })
    .returning();
  const source = await note(db, { text: 'bloem hof', language: 'en' }, 'Bloemhof.', {
    action: 'add',
    hints: [{ rule: 'Bloemhof is one word.', keyterm: 'Bloemhof', retireHintId: older?.id ?? null }],
  });
  await source.derive();

  const { cap, activeCount, hints } = await listTranscriptionHints({ db });

  expect({ cap, activeCount }).toEqual({ cap: 100, activeCount: 1 });
  expect(hints).toEqual([
    expect.objectContaining({
      rule: 'Bloemhof is one word.',
      retiredAt: null,
      supersededBy: null,
      source: { id: source.id, rawText: 'bloem hof', shownText: 'bloem hof.', savedText: 'Bloemhof.' },
    }),
    expect.objectContaining({
      id: older?.id,
      retiredAt: expect.any(String),
      supersededBy: { id: hints[0]?.id, rule: 'Bloemhof is one word.' },
      source: null,
    }),
  ]);
});
