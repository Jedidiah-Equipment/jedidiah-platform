import { transcribeVoiceNote } from '@pkg/core';
import { transcriptionHints, user } from '@pkg/db';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const M4A = new Uint8Array([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);

const test = createTester(async ({ db }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test User',
    email: 'test@example.com',
    emailVerified: true,
    contractingRole: 'foreman',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const heard = (language: string, business: 'equipment' | 'contracting' = 'contracting') =>
    transcribeVoiceNote({
      db,
      actorUserId: 'test-user-id',
      audio: M4A,
      business,
      purpose: 'field note',
      setting: 'a test note',
      keyterms: async () => [],
      engine: {
        transcribe: async () => ({ text: 'the gate at rooi kraal is open', language }),
        tidy: async ({ rawText }) => ({ text: rawText, language: null }),
        derive: async () => ({ action: 'none', reason: 'Unused.' }),
      },
    });
  return { heard, db };
});

test('a saved correction schedules one hint derivation; a kept or non-English note schedules none', async ({
  context,
}) => {
  const scheduled: string[] = [];
  const session = mockSession(null);
  session.user.contractingRole = 'foreman';
  const caller = context.createCaller(session, {
    transcriptions: { hintDerivations: { schedule: (id) => scheduled.push(id) } },
  });
  const corrected = await context.heard('eng');
  const kept = await context.heard('eng');
  const afrikaans = await context.heard('afr');

  await caller.transcriptions.saved({
    business: 'contracting',
    id: corrected.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'field note',
  });
  await caller.transcriptions.saved({ business: 'contracting', id: kept.id, text: kept.text, purpose: 'field note' });
  await caller.transcriptions.saved({
    business: 'contracting',
    id: afrikaans.id,
    text: 'Die hek is oop.',
    purpose: 'field note',
  });

  expect(scheduled).toEqual([corrected.id]);
  await expect(
    caller.transcriptions.saved({ business: 'contracting', id: corrected.id, text: 'Again.', purpose: 'field note' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
});

test('only a holder of contracting_transcription:read reviews Transcriptions, hints and prompts', async ({
  context,
}) => {
  const foreman = mockSession(null);
  foreman.user.contractingRole = 'foreman';
  const admin = mockSession(null);
  admin.user.contractingRole = 'contracting-admin';
  const note = await context.heard('eng');
  await context.createCaller(foreman).transcriptions.saved({
    business: 'contracting',
    id: note.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'field note',
  });

  await expect(context.createCaller(foreman).transcriptions.list({ business: 'contracting' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(context.createCaller(foreman).transcriptions.prompts({ business: 'contracting' })).rejects.toMatchObject(
    {
      code: 'FORBIDDEN',
    },
  );
  const caller = context.createCaller(admin, {
    transcriptions: {
      businesses: {
        contracting: {
          setting: 'a test Contracting note',
          keyterms: async () => [{ keyterm: 'Rooikraal', source: 'hint' }],
        },
        equipment: { setting: 'a test Equipment note', keyterms: async () => [] },
      },
    },
  });
  expect(await caller.transcriptions.list({ business: 'contracting' })).toMatchObject({
    total: 1,
    items: [{ id: note.id, createdByName: 'Test User', hintStatus: { kind: 'pending' } }],
  });
  expect(await caller.transcriptions.hints({ business: 'contracting' })).toEqual({
    cap: 100,
    activeCount: 0,
    hints: [],
  });
  expect(await caller.transcriptions.prompts({ business: 'contracting' })).toMatchObject({
    speech: { model: 'test-transcription-model', keyterms: ['Rooikraal'], cutOff: [] },
    tidy: {
      model: 'test-chat-model',
      system: expect.stringContaining('a test Contracting note'),
      prompt: expect.stringContaining('{{raw transcript}}'),
    },
    derivation: { model: 'test-chat-model', prompt: expect.stringContaining('{{saved text}}') },
  });
});

test('the Contracting alias still hears a save from a phone on the old build', async ({ context }) => {
  const scheduled: string[] = [];
  const session = mockSession(null);
  session.user.contractingRole = 'foreman';
  const caller = context.createCaller(session, {
    transcriptions: { hintDerivations: { schedule: (id) => scheduled.push(id) } },
  });
  const note = await context.heard('eng');

  await caller.contractingTranscriptions.saved({
    id: note.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'field note',
  });

  expect(scheduled).toEqual([note.id]);
});

test("each business's Transcriptions open only under its own permissions", async ({ context }) => {
  const foreman = mockSession(null);
  foreman.user.contractingRole = 'foreman';
  const superAdmin = mockSession(null);
  superAdmin.user.role = 'super-admin';
  const equipmentNote = await context.heard('eng', 'equipment');
  await context.heard('eng');

  await expect(
    context.createCaller(foreman).transcriptions.saved({
      business: 'equipment',
      id: equipmentNote.id,
      text: 'Kept.',
      purpose: 'field note',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(await context.createCaller(superAdmin).transcriptions.list({ business: 'contracting' })).toMatchObject({
    total: 1,
  });
});

test('every Equipment role but app-store-tester may record; only super-admin reviews Equipment', async ({
  context,
}) => {
  const as = (role: 'admin' | 'super-admin' | 'job-manager' | 'app-store-tester') => {
    const session = mockSession(null);
    session.user.role = role;
    return context.createCaller(session);
  };
  const note = await context.heard('eng', 'equipment');
  await context.db.insert(transcriptionHints).values([
    { business: 'equipment', rule: 'Spell it Bossies.', keyterm: 'Bossies' },
    { business: 'contracting', rule: 'Spell it Rooikraal.', keyterm: 'Rooikraal' },
  ]);

  await expect(
    as('app-store-tester').transcriptions.saved({
      business: 'equipment',
      id: note.id,
      text: 'Kept.',
      purpose: 'job feedback',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  // A dictated Corrective Feedback is readable on the page, so an admin, who cannot read that feedback, is refused.
  await expect(as('admin').transcriptions.list({ business: 'equipment' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(as('job-manager').transcriptions.hints({ business: 'equipment' })).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(await as('super-admin').transcriptions.list({ business: 'equipment' })).toMatchObject({
    total: 1,
    items: [{ id: note.id }],
  });
  expect(
    (await as('super-admin').transcriptions.hints({ business: 'equipment' })).hints.map((hint) => hint.rule),
  ).toEqual(['Spell it Bossies.']);
});
