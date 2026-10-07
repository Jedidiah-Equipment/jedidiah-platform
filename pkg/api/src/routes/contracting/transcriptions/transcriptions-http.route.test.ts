import multipart from '@fastify/multipart';
import type { TranscriptionEngine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { contractingTranscriptions } from '@pkg/db/contracting';
import { fileTooLargeMessage } from '@pkg/domain';
import { VOICE_NOTE_POLICY } from '@pkg/domain/contracting';
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
  transcribe: async () => ({ text: 'die hek is oop', language: null }),
  tidy: async () => ({ text: 'Die hek is oop.', language: 'af' }),
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
  const appWith = async (withEngine: TranscriptionEngine) => {
    const app = Fastify();
    app.decorate('auth', auth);
    await app.register(multipart);
    await registerTranscriptionHttpRoutes(app, { db, engine: withEngine, keyterms: async () => [] });
    return app;
  };
  return { appWith, db };
});

function signInAs(contractingRole: ContractingRole) {
  const session = mockSession(null);
  session.user.contractingRole = contractingRole;
  state.session = session;
}

const M4A = Buffer.from([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41, 0x20]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function upload(audio: Buffer | Buffer[], fields: Record<string, string> = { purpose: 'capture comment' }) {
  const boundary = 'voice-boundary';
  const chunks: Buffer[] = Object.entries(fields).map(([key, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`),
  );
  for (const bytes of Array.isArray(audio) ? audio : [audio])
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="voice-note.m4a"\r\nContent-Type: audio/mp4\r\n\r\n`,
      ),
      bytes,
      Buffer.from('\r\n'),
    );
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    method: 'POST' as const,
    url: '/api/contracting/transcriptions',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

test('a foreman’s voice note answers with the Transcription; other audio is refused', async ({ context }) => {
  const app = await context.appWith(engine);
  try {
    signInAs('foreman');
    const response = await app.inject(upload(M4A));
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: expect.any(String), text: 'Die hek is oop.', language: 'af' });

    const png = await app.inject(upload(PNG));
    expect(png.statusCode).toBe(400);
    expect(png.json()).toMatchObject({ data: { appCode: 'file.content_type_not_allowed' } });
  } finally {
    await app.close();
  }
});

test('refuses roles without voice notes, and tells silence from a failing speech model', async ({ context }) => {
  const app = await context.appWith(engine);
  const failing = await context.appWith({
    ...engine,
    transcribe: async () => {
      throw new Error('timeout');
    },
  });
  const silent = await context.appWith({ ...engine, transcribe: async () => ({ text: '', language: null }) });
  try {
    signInAs('contracting-invoicing');
    const forbidden = await app.inject(upload(M4A));
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toMatchObject({ data: { appCode: 'transcription.forbidden' } });

    signInAs('foreman');
    const unavailable = await failing.inject(upload(M4A));
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toMatchObject({ data: { appCode: 'transcription.unavailable' } });

    const nothingHeard = await silent.inject(upload(M4A));
    expect(nothingHeard.statusCode).toBe(400);
    expect(nothingHeard.json()).toMatchObject({ data: { appCode: 'transcription.nothing_heard' } });
  } finally {
    await app.close();
    await failing.close();
    await silent.close();
  }
});

test.for([
  ['missing purpose', {}],
  ['blank purpose', { purpose: '' }],
] as const)('refuses %s with the Voice Note upload sentence', async ([, fields], { context }) => {
  const app = await context.appWith(engine);
  try {
    signInAs('foreman');
    const response = await app.inject(upload(M4A, fields));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      data: { appCode: 'transcription.invalid_upload' },
      message: 'Send a purpose and one complete voice note.',
    });
    expect(await context.db.select().from(contractingTranscriptions)).toEqual([]);
  } finally {
    await app.close();
  }
});

test('refuses two audio parts and excess fields without a Transcription or calling the speech model', async ({
  context,
}) => {
  const refusedEngine: TranscriptionEngine = {
    ...engine,
    transcribe: async () => {
      throw new Error('Refused uploads must not reach the speech model');
    },
  };
  const app = await context.appWith(refusedEngine);
  try {
    signInAs('foreman');
    for (const request of [upload([M4A, M4A]), upload(M4A, { purpose: 'capture comment', extra: 'x' })]) {
      const response = await app.inject(request);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        data: { appCode: 'transcription.invalid_upload' },
        message: 'Send a purpose and one complete voice note.',
      });
      expect(await context.db.select().from(contractingTranscriptions)).toEqual([]);
    }
  } finally {
    await app.close();
  }
});

test('an oversized Voice Note keeps the file policy refusal and leaves no Transcription', async ({ context }) => {
  const app = await context.appWith(engine);
  try {
    signInAs('foreman');
    const response = await app.inject(upload(Buffer.alloc(VOICE_NOTE_POLICY.maxBytes + 1)));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      data: { appCode: 'file.too_large' },
      message: fileTooLargeMessage(VOICE_NOTE_POLICY.maxBytes),
    });
    expect(await context.db.select().from(contractingTranscriptions)).toEqual([]);
  } finally {
    await app.close();
  }
});
