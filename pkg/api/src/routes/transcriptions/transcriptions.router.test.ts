import { transcribeVoiceNote } from '@pkg/core';
import { transcriptionHints, user } from '@pkg/db';
import { TRANSCRIPTION_HINT_CAP } from '@pkg/domain';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { M4A_HEADER, stubEngine, testProfile, testProfiles } from '@/test/transcription-fixtures.js';

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
      audio: M4A_HEADER,
      purpose: 'field note',
      profile: testProfile(business),
      engine: stubEngine({ text: 'the gate at rooi kraal is open', language }),
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
    id: corrected.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'field note',
  });
  await caller.transcriptions.saved({ id: kept.id, text: kept.text, purpose: 'field note' });
  await caller.transcriptions.saved({
    id: afrikaans.id,
    text: 'Die hek is oop.',
    purpose: 'field note',
  });

  expect(scheduled).toEqual([corrected.id]);
  await expect(
    caller.transcriptions.saved({ id: corrected.id, text: 'Again.', purpose: 'field note' }),
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
      profiles: {
        ...testProfiles(),
        contracting: testProfile('contracting', [{ keyterm: 'Rooikraal', source: 'Farm' }]),
      },
    },
  });
  expect(await caller.transcriptions.list({ business: 'contracting' })).toMatchObject({
    total: 1,
    items: [{ id: note.id, createdByName: 'Test User', hintStatus: { kind: 'pending' } }],
  });
  expect(await caller.transcriptions.hints({ business: 'contracting' })).toEqual({
    cap: TRANSCRIPTION_HINT_CAP,
    activeCount: 0,
    hints: [],
  });
  expect(await caller.transcriptions.prompts({ business: 'contracting' })).toMatchObject({
    speech: { model: 'test-transcription-model', keyterms: ['Rooikraal'], cutOff: [] },
    tidy: {
      model: 'test-chat-model',
      system: expect.stringContaining('a test contracting note'),
      prompt: expect.stringContaining('{{raw transcript}}'),
    },
    derivation: { model: 'test-chat-model', prompt: expect.stringContaining('{{saved text}}') },
  });
});

test('only the person who recorded a Transcription may save it, whichever business it is in', async ({ context }) => {
  const stranger = mockSession(null);
  stranger.user.id = 'someone-else';
  stranger.user.contractingRole = 'foreman';
  const superAdmin = mockSession(null);
  superAdmin.user.role = 'super-admin';
  const equipmentNote = await context.heard('eng', 'equipment');
  await context.heard('eng');

  await expect(
    context.createCaller(stranger).transcriptions.saved({ id: equipmentNote.id, text: 'Kept.', purpose: 'field note' }),
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
      id: note.id,
      text: 'Kept.',
      purpose: 'job feedback',
    }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
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
