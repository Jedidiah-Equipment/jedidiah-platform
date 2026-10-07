import { user } from '@pkg/db';
import { contractingMachines, contractingTranscriptionHints, contractingTranscriptions } from '@pkg/db/contracting';
import { TRANSCRIPTION_HINT_CAP } from '@pkg/domain/contracting';
import type { HintDerivation } from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { adminId, foremanId, seedJobFixtures } from '../test/job-fixtures.js';
import { loadKeyterms } from './keyterm-registry.js';
import {
  deriveHintFor,
  listActiveHints,
  listTranscriptionsAwaitingHints,
  recordTranscriptionSaved,
  type TranscriptionEngine,
  transcribeVoiceNote,
} from './transcription-service.js';

const M4A = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

function engineHearing(
  heard: { text: string; language: string | null },
  derivation: HintDerivation = { action: 'none', reason: 'No rule.' },
) {
  const calls = { keyterms: [] as (readonly string[])[], derive: 0 };
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

const test = createTester(async ({ db }) => ({ fixtures: await seedJobFixtures(db) }));

async function noted(
  db: Parameters<typeof transcribeVoiceNote>[0]['db'],
  heard: { text: string; language: string | null },
  derivation?: HintDerivation,
) {
  const { engine, calls } = engineHearing(heard, derivation);
  const transcription = await transcribeVoiceNote({
    db,
    actorUserId: foremanId,
    audio: M4A,
    purpose: 'capture comment',
    engine,
    keyterms: async () => ['Rooikraal'],
  });
  return { transcription, engine, calls };
}

test('keeps what was heard, shown and its language, and stamps only the speaker’s first save', async ({
  context: { db },
}) => {
  // The speech model named no language, so the tidy pass's tag is kept.
  const { transcription, calls } = await noted(db, { text: 'the gate at rooi kraal is open', language: null });

  expect(transcription).toEqual({ id: expect.any(String), text: 'The gate at rooi kraal is open.', language: 'en' });
  expect(calls.keyterms).toEqual([['Rooikraal']]);
  const input = { id: transcription.id, text: 'The gate at Rooikraal is open.', purpose: 'capture comment' };
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
  expect(
    await db.query.contractingTranscriptions.findFirst({ where: eq(contractingTranscriptions.id, transcription.id) }),
  ).toMatchObject({
    rawText: 'the gate at rooi kraal is open',
    shownText: 'The gate at rooi kraal is open.',
    savedText: 'The gate at Rooikraal is open.',
    savedAt: expect.any(Date),
  });
});

test('refuses audio that is not M4A and says when nothing was heard', async ({ context: { db } }) => {
  const { engine } = engineHearing({ text: '', language: null });
  const transcribe = (audio: Uint8Array) =>
    transcribeVoiceNote({ db, actorUserId: foremanId, audio, purpose: 'field note', engine, keyterms: async () => [] });

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
      input: { id: afrikaans.transcription.id, text: 'Die hek by Rooikraal is oop.', purpose: 'capture comment' },
    }),
    recordTranscriptionSaved({
      db,
      actorUserId: foremanId,
      input: { id: kept.transcription.id, text: ' The gate is open. ', purpose: 'capture comment' },
    }),
  ]);

  expect(saved.map((result) => result.deriveHint)).toEqual([false, false]);
  expect(await listTranscriptionsAwaitingHints({ db })).toEqual([]);
  expect(await deriveHintFor({ db, id: afrikaans.transcription.id, engine: afrikaans.engine })).toBeNull();
  expect(afrikaans.calls.derive).toBe(0);
});

test('a new hint retires the one it supersedes and links them, once', async ({ context: { db } }) => {
  const [old] = await db.insert(contractingTranscriptionHints).values({ rule: 'Rooi Kraal is two words.' }).returning();
  const { transcription, engine, calls } = await noted(
    db,
    { text: 'the gate at rooi kraal is open', language: 'eng' },
    { action: 'add', rule: 'The farm is spelled Rooikraal.', keyterm: 'Rooikraal', retireHintId: old?.id ?? null },
  );
  await recordTranscriptionSaved({
    db,
    actorUserId: foremanId,
    input: { id: transcription.id, text: 'The gate at Rooikraal is open.', purpose: 'capture comment' },
  });
  expect(await listTranscriptionsAwaitingHints({ db })).toEqual([transcription.id]);

  await deriveHintFor({ db, id: transcription.id, engine });
  await deriveHintFor({ db, id: transcription.id, engine });

  expect(calls.derive).toBe(1);
  const active = await listActiveHints({ db });
  expect(active).toEqual([{ id: expect.any(String), rule: 'The farm is spelled Rooikraal.', keyterm: 'Rooikraal' }]);
  expect(
    await db.query.contractingTranscriptionHints.findFirst({
      where: eq(contractingTranscriptionHints.id, old?.id ?? ''),
    }),
  ).toMatchObject({ retiredAt: expect.any(Date), supersededByHintId: active[0]?.id });
  expect(await listTranscriptionsAwaitingHints({ db })).toEqual([]);
});

test('a full hint list retires its oldest hint to make room', async ({ context: { db } }) => {
  await db.insert(contractingTranscriptionHints).values(
    Array.from({ length: TRANSCRIPTION_HINT_CAP }, (_, index) => ({
      rule: `Rule ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
    })),
  );
  const { transcription, engine } = await noted(
    db,
    { text: 'code read on the tipper', language: 'eng' },
    { action: 'add', rule: 'Say Code Red, not code read.', keyterm: null, retireHintId: null },
  );
  await recordTranscriptionSaved({
    db,
    actorUserId: foremanId,
    input: { id: transcription.id, text: 'Code Red on the tipper.', purpose: 'capture comment' },
  });

  await deriveHintFor({ db, id: transcription.id, engine });

  const active = await listActiveHints({ db });
  expect(active).toHaveLength(TRANSCRIPTION_HINT_CAP);
  expect(active[0]?.rule).toBe('Rule 1');
  expect(active.at(-1)?.rule).toBe('Say Code Red, not code read.');
});

test('the keyterm registry names the working fleet, field people and taught keyterms', async ({
  context: { db, fixtures },
}) => {
  const now = new Date();
  const person = (id: string, name: string, contractingRole: 'mechanic' | 'driver', isDevice = false) => ({
    id,
    name,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    isDevice,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([person('mechanic-1', 'Thabo Nkosi', 'mechanic'), person('yard-tablet', 'Yard Tablet', 'driver', true)]);
  await db
    .update(contractingMachines)
    .set({ retiredAt: now, retiredReason: 'Sold' })
    .where(eq(contractingMachines.id, fixtures.tipper.id));
  await db.insert(contractingTranscriptionHints).values([
    { rule: 'Spell it Bloemhof.', keyterm: 'Bloemhof' },
    { rule: 'Old rule.', keyterm: 'Vaalkop', retiredAt: now },
  ]);

  const keyterms = await loadKeyterms({ db, now });

  expect(keyterms).toEqual(expect.arrayContaining(['CAT320-1', 'Thabo Nkosi', 'Thabo', 'Sipho', 'Bloemhof']));
  expect(keyterms).not.toEqual(expect.arrayContaining(['TIP-7']));
  expect(keyterms).not.toContain('Yard Tablet');
  expect(keyterms).not.toContain('Vaalkop');
  expect(keyterms[0]).toBe('Bloemhof');
});
