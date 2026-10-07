import multipart from '@fastify/multipart';
import { InMemoryStorageAdapter } from '@pkg/core';
import { createCategory, createMachine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { MachineCreateInput } from '@pkg/schema/contracting';
import Fastify from 'fastify';
import { expect, vi } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';
import { registerBreakdownHttpRoutes } from './breakdowns-http.route.js';

const state = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('../../../auth/session.js', async (original) => ({
  ...(await original<typeof import('../../../auth/session.js')>()),
  getSessionFromHeaders: async () => state.session,
}));

const jpeg = Buffer.from([255, 216, 255]);
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const test = createTester(async ({ db, auth }) => {
  await db.insert(user).values({
    id: 'test-user-id',
    name: 'Sipho',
    email: 'breakdown-http@example.com',
    emailVerified: true,
    contractingRole: 'foreman',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const category = await createCategory({
    db,
    actorUserId: 'test-user-id',
    input: { name: 'Tractors', kind: 'machine' },
  });
  const machine = await createMachine({
    db,
    actorUserId: 'test-user-id',
    input: MachineCreateInput.parse({ code: 'JD6140M-2', make: 'Deere', model: '6140M', categoryId: category.id }),
  });
  const storage = new InMemoryStorageAdapter();
  const app = Fastify();
  app.decorate('auth', auth);
  await app.register(multipart);
  await registerBreakdownHttpRoutes(app, { db, storage });
  state.session = mockSession(null);
  (state.session as ReturnType<typeof mockSession>).user.contractingRole = 'foreman';
  return { app, machineId: machine.id, storage };
});

function upload(machineId: string, photos: Buffer[]) {
  const boundary = 'breakdown-boundary';
  const fields = {
    subject: JSON.stringify({ kind: 'machine', id: machineId }),
    urgency: 'code-red',
    description: 'Hydraulic hose burst',
    latitude: '-25.7479',
    longitude: '28.2293',
  };
  const chunks: Buffer[] = Object.entries(fields).map(([key, value]) =>
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`),
  );
  for (const [index, photo] of photos.entries())
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo-${index}.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      photo,
      Buffer.from('\r\n'),
    );
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    method: 'POST' as const,
    url: '/api/contracting/breakdowns',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: Buffer.concat(chunks),
  };
}

test('reports a Breakdown with two photos, then serves each photo privately', async ({ context }) => {
  const { app, machineId, storage } = context;
  try {
    const response = await app.inject(upload(machineId, [jpeg, png]));
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body).toMatchObject({ photoCount: 2, latitude: -25.7479, longitude: 28.2293, urgency: 'code-red' });
    expect(storage.objects.size).toBe(2);
    const photo = await app.inject({ url: `/api/contracting/breakdowns/${body.id}/photos/${body.photos[1].id}` });
    expect(photo.statusCode).toBe(200);
    expect(photo.headers).toMatchObject({ 'content-type': 'image/png', 'cache-control': 'private, no-store' });
  } finally {
    await app.close();
  }
});

test('refuses a seventh photo and anything but PNG or JPEG without keeping a row or an object', async ({ context }) => {
  const { app, machineId, storage } = context;
  try {
    const tooMany = await app.inject(
      upload(
        machineId,
        Array.from({ length: 7 }, () => jpeg),
      ),
    );
    expect(tooMany.statusCode).toBe(409);
    expect(tooMany.json()).toMatchObject({ data: { appCode: 'breakdown.too_many_photos' } });
    const notAPhoto = await app.inject(upload(machineId, [Buffer.from('not a photo')]));
    expect(notAPhoto.statusCode).toBe(400);
    expect(storage.objects.size).toBe(0);
  } finally {
    await app.close();
  }
});
