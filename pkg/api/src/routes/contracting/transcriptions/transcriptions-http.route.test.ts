import multipart from '@fastify/multipart';
import type { TranscriptionEngine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import type { ContractingRole } from '@pkg/schema';
import Fastify from 'fastify';
import { expect, vi } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { registerTranscriptionHttpRoutes } from './transcriptions-http.route.js';

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../../../auth/session.js', async (original) => ({
  ...(await original<typeof import('../../../auth/session.js')>()),
  getSessionFromHeaders: async () => state.session,
}));

const engine: TranscriptionEngine = {
  transcribe: async () => ({ text: 'die hek is oop', language: 'afr' }),
  tidy: async () => 'Die hek is oop.',
  derive: async () => ({ action: 'none', reason: 'Not used here.' }),
};

const test = createTester(async ({ db, auth }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Test',
    email: 'transcription-http@example.com',
    emailVerified: true,
    contractingRole: 'foreman',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const appWith = async (withEngine: TranscriptionEngine | null) => {
    const app = Fastify();
    app.decorate('auth', auth);
    await app.register(multipart);
    await registerTranscriptionHttpRoutes(app, { db, engine: withEngine, keyterms: async () => [] });
    return app;
  };
  return { appWith };
});

function signInAs(contractingRole: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = contractingRole;
  state.session = session;
}

const M4A = Buffer.from([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function upload(audio: Buffer) {
  const boundary = 'voice-boundary';
  return {
    method: 'POST' as const,
    url: '/api/contracting/transcriptions',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\ncapture comment\r\n`),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice-note.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`,
      ),
      audio,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]),
  };
}

test('a foreman’s voice note answers with the Transcription; other audio is refused', async ({ context }) => {
  const app = await context.appWith(engine);
  try {
    signInAs('foreman');
    const response = await app.inject(upload(M4A));
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: expect.any(String), text: 'Die hek is oop.', language: 'afr' });

    const png = await app.inject(upload(PNG));
    expect(png.statusCode).toBe(400);
    expect(png.json()).toMatchObject({ data: { appCode: 'file.content_type_not_allowed' } });
  } finally {
    await app.close();
  }
});

test('refuses roles without voice notes and answers unavailable without a speech key', async ({ context }) => {
  const app = await context.appWith(engine);
  const keyless = await context.appWith(null);
  try {
    signInAs('contracting-invoicing');
    const forbidden = await app.inject(upload(M4A));
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ data: { appCode: 'transcription.forbidden' } });

    signInAs('foreman');
    const unavailable = await keyless.inject(upload(M4A));
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ data: { appCode: 'transcription.unavailable' } });
  } finally {
    await app.close();
    await keyless.close();
  }
});
