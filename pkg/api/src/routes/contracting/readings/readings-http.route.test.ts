import multipart from '@fastify/multipart';
import { InMemoryStorageAdapter } from '@pkg/core';
import { createCategory, createMachine, listReadingsByMachine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { MachineCreateInput } from '@pkg/schema/contracting';
import Fastify from 'fastify';
import { expect, vi } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { registerReadingHttpRoutes } from './readings-http.route.js';

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../../../auth/session.js', async (original) => ({
  ...(await original<typeof import('../../../auth/session.js')>()),
  getSessionFromHeaders: async () => state.session,
}));
const test = createTester(async ({ db, auth }) => {
  const actorUserId = 'test-user-id';
  await db.insert(user).values({
    id: actorUserId,
    name: 'Test',
    email: 'reading-http@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const category = await createCategory({ db, actorUserId, input: { name: 'Tractors' } });
  const machine = await createMachine({
    db,
    actorUserId,
    input: MachineCreateInput.parse({ code: 'T1', make: 'Deere', model: '6140', categoryId: category.id }),
  });
  const storage = new InMemoryStorageAdapter();
  const app = Fastify();
  app.decorate('auth', auth);
  await app.register(multipart);
  await registerReadingHttpRoutes(app, { db, storage, readPhoto: async () => ({ value: 123.4, confidence: 0.91 }) });
  state.session = mockSession(null);
  (state.session as ReturnType<typeof mockSession>).user.contractingRole = 'foreman';
  return { db, app, machineId: machine.id, storage };
});
function upload(machineId: string, photo: Buffer | null, close = true, extra: Record<string, string> = {}) {
  const boundary = 'reading-boundary';
  const fields = { machineId, role: 'spot', value: '123.4', capturedAt: '2026-09-07T08:00:00Z', ...extra };
  const chunks: Buffer[] = Object.entries(fields).map(([key, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`),
  );
  if (photo)
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="meter.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      photo,
      Buffer.from('\r\n'),
    );
  if (close) chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    method: 'POST' as const,
    url: '/api/contracting/readings',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}
test('atomic multipart stores the complete photo and AI outcome; rejects broken and invalid uploads without a row', async ({
  context,
}) => {
  const { app, db, machineId, storage } = context;
  try {
    for (const request of [
      upload(machineId, Buffer.from('not a photo')),
      upload(machineId, Buffer.from([255, 216, 255]), false),
    ]) {
      const response = await app.inject(request);
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(await listReadingsByMachine({ db, machineId })).toEqual([]);
      expect(storage.objects.size).toBe(0);
    }
    const response = await app.inject(upload(machineId, Buffer.from([255, 216, 255])));
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      method: 'photo',
      photo: { contentType: 'image/jpeg' },
      aiValue: 123.4,
      aiConfidence: 0.91,
      aiVerification: 'agrees',
    });
    expect(storage.objects.size).toBe(1);
    const manual = await app.inject(upload(machineId, null));
    expect(manual.json()).toMatchObject({ photo: null, method: 'manual', aiVerification: 'not-applicable' });
  } finally {
    await app.close();
  }
});
test('rejects unauthenticated and Equipment-only uploads before parsing their body', async ({ context }) => {
  try {
    state.session = null;
    expect((await context.app.inject(upload(context.machineId, null))).statusCode).toBe(401);
    state.session = mockSession('admin');
    expect((await context.app.inject(upload(context.machineId, null))).statusCode).toBe(403);
  } finally {
    await context.app.close();
  }
});

test('accepts every mobile multipart field and retries a photo capture without duplicating it', async ({ context }) => {
  const { app, db, machineId, storage } = context;
  try {
    const localId = '78108c3d-4b34-44f1-bf87-4fcb00a6a233';
    const request = upload(machineId, Buffer.from([255, 216, 255]), true, {
      localId,
      expectedPreviousId: '',
      disputePrevious: 'false',
    });
    const first = await app.inject(request);
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ id: localId, photo: { contentType: 'image/jpeg' } });
    expect((await app.inject(request)).json().id).toBe(localId);
    expect(await listReadingsByMachine({ db, machineId })).toHaveLength(1);
    expect(storage.objects.size).toBe(1);
  } finally {
    await app.close();
  }
});
