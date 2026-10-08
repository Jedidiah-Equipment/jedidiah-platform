import { transcribeVoiceNote } from '@pkg/core/contracting';
import { user } from '@pkg/db';
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
  const heard = (language: string) =>
    transcribeVoiceNote({
      db,
      actorUserId: 'test-user-id',
      audio: M4A,
      purpose: 'field note',
      keyterms: async () => [],
      engine: {
        transcribe: async () => ({ text: 'the gate at rooi kraal is open', language }),
        tidy: async ({ rawText }) => ({ text: rawText, language: null }),
        derive: async () => ({ action: 'none', reason: 'Unused.' }),
      },
    });
  return { heard };
});

test('a saved correction schedules one hint derivation; a kept or non-English note schedules none', async ({
  context,
}) => {
  const scheduled: string[] = [];
  const session = mockSession(null);
  session.user.contractingRole = 'foreman';
  const caller = context.createCaller(session, {
    contracting: { hintDerivations: { schedule: (id) => scheduled.push(id) } },
  });
  const corrected = await context.heard('eng');
  const kept = await context.heard('eng');
  const afrikaans = await context.heard('afr');

  await caller.contractingTranscriptions.saved({
    id: corrected.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'field note',
  });
  await caller.contractingTranscriptions.saved({ id: kept.id, text: kept.text, purpose: 'field note' });
  await caller.contractingTranscriptions.saved({ id: afrikaans.id, text: 'Die hek is oop.', purpose: 'field note' });

  expect(scheduled).toEqual([corrected.id]);
  await expect(
    caller.contractingTranscriptions.saved({ id: corrected.id, text: 'Again.', purpose: 'field note' }),
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
  await context.createCaller(foreman).contractingTranscriptions.saved({
    id: note.id,
    text: 'The gate at Rooikraal is open.',
    purpose: 'field note',
  });

  await expect(context.createCaller(foreman).contractingTranscriptions.list({})).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  await expect(context.createCaller(foreman).contractingTranscriptions.prompts()).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const caller = context.createCaller(admin);
  expect(await caller.contractingTranscriptions.list({})).toMatchObject({
    total: 1,
    items: [{ id: note.id, createdByName: 'Test User', hintStatus: { kind: 'pending' } }],
  });
  expect(await caller.contractingTranscriptions.hints()).toEqual({ cap: 100, activeCount: 0, hints: [] });
  expect(await caller.contractingTranscriptions.prompts()).toMatchObject({
    speech: { model: 'test-transcription-model', prompt: expect.stringContaining('Test User') },
    tidy: { model: 'test-chat-model', prompt: expect.stringContaining('{{raw transcript}}') },
    derivation: { model: 'test-chat-model', prompt: expect.stringContaining('{{saved text}}') },
  });
});
