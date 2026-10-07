import multipart from '@fastify/multipart';
import { InMemoryStorageAdapter } from '@pkg/core';
import { createCategory, createMachine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { contractingBreakdowns } from '@pkg/db/contracting';
import { fileTooLargeMessage } from '@pkg/domain';
import { BREAKDOWN_PHOTO_POLICY } from '@pkg/domain/contracting';
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
  return { app, db, machineId: machine.id, storage };
});

function upload(machineId: string, photos: Buffer[], extra: Record<string, string | undefined> = {}) {
  const boundary = 'breakdown-boundary';
  const fields = {
    subject: JSON.stringify({ kind: 'machine', id: machineId }),
    urgency: 'code-red',
    description: 'Hydraulic hose burst',
    latitude: '-25.7479',
    longitude: '28.2293',
    ...extra,
  };
  const chunks: Buffer[] = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) =>
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

test('refuses anything but PNG or JPEG without keeping a Breakdown or object', async ({ context }) => {
  const { app, db, machineId, storage } = context;
  try {
    const response = await app.inject(upload(machineId, [Buffer.from('not a photo')]));
    expect(response.statusCode).toBe(400);
    expect(response.json().data.appCode).toBe('file.content_type_not_allowed');
    expect(await db.select().from(contractingBreakdowns)).toEqual([]);
    expect(storage.objects.size).toBe(0);
  } finally {
    await app.close();
  }
});

test('blank description uses the schema sentence and leaves no Breakdown or photo', async ({ context }) => {
  const { app, db, machineId, storage } = context;
  try {
    const response = await app.inject(upload(machineId, [jpeg], { description: '' }));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ data: { appCode: 'breakdown.invalid_upload' }, message: 'Describe the problem' });
    expect(await db.select().from(contractingBreakdowns)).toEqual([]);
    expect(storage.objects.size).toBe(0);
  } finally {
    await app.close();
  }
});

test.for([
  [{ longitude: undefined }, 'Send both coordinates or neither.'],
  [{ subject: '{broken' }, 'Send the report fields and at most 6 complete photos.'],
] as const)('refuses invalid Breakdown fields: %j', async ([fields, message], { context }) => {
  const { app, db, machineId, storage } = context;
  try {
    const response = await app.inject(upload(machineId, [jpeg], fields));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ data: { appCode: 'breakdown.invalid_upload' }, message });
    expect(await db.select().from(contractingBreakdowns)).toEqual([]);
    expect(storage.objects.size).toBe(0);
  } finally {
    await app.close();
  }
});

test.for([7, 8, 12])(
  'refuses %i photos with the six-photo sentence on both Breakdown upload paths',
  async (photoCount, { context }) => {
    const { app, db, machineId, storage } = context;
    try {
      const response = await app.inject(
        upload(
          machineId,
          Array.from({ length: photoCount }, () => jpeg),
        ),
      );
      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({
        data: { appCode: 'breakdown.too_many_photos' },
        message: 'A Breakdown keeps at most 6 photos.',
      });
      expect(await db.select().from(contractingBreakdowns)).toEqual([]);
      expect(storage.objects.size).toBe(0);
      const created = await app.inject(upload(machineId, []));
      expect(created.statusCode).toBe(201);
      const photosRequest = upload(
        machineId,
        Array.from({ length: photoCount }, () => jpeg),
        {
          subject: undefined,
          urgency: undefined,
          description: undefined,
          latitude: undefined,
          longitude: undefined,
        },
      );
      const added = await app.inject({
        ...photosRequest,
        url: `/api/contracting/breakdowns/${created.json().id}/photos`,
      });
      expect(added.statusCode).toBe(409);
      expect(added.json()).toEqual({
        data: { appCode: 'breakdown.too_many_photos' },
        message: 'A Breakdown keeps at most 6 photos.',
      });
      expect(await db.select().from(contractingBreakdowns)).toMatchObject([{ id: created.json().id, photos: [] }]);
      expect(storage.objects.size).toBe(0);
    } finally {
      await app.close();
    }
  },
);

test('refuses excess Breakdown fields with the upload sentence and leaves no stored evidence', async ({ context }) => {
  const { app, db, machineId, storage } = context;
  try {
    const response = await app.inject(
      upload(machineId, [jpeg], { localId: '78108c3d-4b34-44f1-bf87-4fcb00a6a233', jobId: '', extra: 'x' }),
    );
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      data: { appCode: 'breakdown.invalid_upload' },
      message: 'Send the report fields and at most 6 complete photos.',
    });
    expect(await db.select().from(contractingBreakdowns)).toEqual([]);
    expect(storage.objects.size).toBe(0);
  } finally {
    await app.close();
  }
});

test('an oversized Breakdown photo keeps the file policy refusal and stores nothing', async ({ context }) => {
  const { app, db, machineId, storage } = context;
  try {
    const response = await app.inject(upload(machineId, [Buffer.alloc(BREAKDOWN_PHOTO_POLICY.maxBytes + 1)]));
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      data: { appCode: 'file.too_large' },
      message: fileTooLargeMessage(BREAKDOWN_PHOTO_POLICY.maxBytes),
    });
    expect(await db.select().from(contractingBreakdowns)).toEqual([]);
    expect(storage.objects.size).toBe(0);
  } finally {
    await app.close();
  }
});
