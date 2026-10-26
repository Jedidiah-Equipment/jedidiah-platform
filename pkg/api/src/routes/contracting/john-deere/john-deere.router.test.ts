import { randomBytes } from 'node:crypto';
import type { Db } from '@pkg/db';
import { contractingJohnDeereConnection } from '@pkg/db/contracting';
import {
  encryptSecret,
  JohnDeereClient,
  JohnDeereConnectionService,
  JohnDeereLinkService,
  NOT_CONNECTED,
} from '@pkg/integrations/contracting';
import { expect } from 'vitest';
import { createActorUser } from '@/test/actor-user.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession, sessionAs } from '@/test/test-utils.js';

const tokenKey = randomBytes(32);
const connectedAt = new Date('2026-10-26T08:00:00.000Z');

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const client = new JohnDeereClient({
    platformBaseUrl: 'https://api.example/platform',
    equipmentBaseUrl: 'https://equipment.example/isg',
    issuer: 'https://signin.example/oauth2/aus',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    // Deere answers a token, one machine and its engine hours.
    fetch: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/token'))
        return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 43_200 });
      if (url.includes('/equipment?'))
        return Response.json({
          values: [
            { id: 'eq-1', principalId: 7, name: 'Big Green', serialNumber: 'PIN-1', organization: [{ id: 4321 }] },
          ],
        });
      if (url.includes('/engineHours'))
        return Response.json({
          values: [{ reading: { valueAsDouble: 812.3 }, reportTime: '2026-10-26T06:00:00.000Z', source: 'TM' }],
        });
      throw new Error(`Unexpected request ${url}`);
    },
    now: () => new Date(),
  });
  const connection = new JohnDeereConnectionService({
    db,
    client,
    tokenKey,
    redirectUri: 'https://api.example/api/contracting/john-deere/callback',
    connectionsReturnUri: 'https://api.example/api/contracting/john-deere/callback?connections=done',
    now: () => new Date(),
  });
  const links = new JohnDeereLinkService({ db, client, connection, now: () => new Date() });
  return { johnDeere: { connection, links }, db };
});

const connect = (db: Db) =>
  db.insert(contractingJohnDeereConnection).values({
    status: 'connected',
    refreshTokenCiphertext: encryptSecret('refresh', tokenKey),
    organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
  });

const contractingSession = (role: Parameters<typeof sessionAs>[1]) => sessionAs('test-user-id', role);

test('status reads Not configured when the environment has no John Deere keys', async ({ context }) => {
  const johnDeere = context.createCaller(mockSession('super-admin')).contractingJohnDeere;
  expect(await johnDeere.status()).toEqual({ configured: false, ...NOT_CONNECTED });
  await expect(johnDeere.connect.start()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
});

test('status reads every connection state', async ({ context: { createCaller, johnDeere: deps, db } }) => {
  const johnDeere = createCaller(contractingSession('contracting-admin'), {
    contracting: { johnDeere: deps },
  }).contractingJohnDeere;
  expect(await johnDeere.status()).toMatchObject({ configured: true, status: 'not-connected' });

  const { url } = await johnDeere.connect.start();
  expect(new URL(url).searchParams.get('scope')).toBe('eq1 offline_access');
  // An open round trip is still Not connected.
  expect(await johnDeere.status()).toMatchObject({ configured: true, status: 'not-connected' });

  await db.update(contractingJohnDeereConnection).set({
    status: 'connected',
    refreshTokenCiphertext: encryptSecret('refresh', tokenKey),
    organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
    connectedByUserId: 'test-user-id',
    connectedAt,
  });
  expect(await johnDeere.status()).toEqual({
    configured: true,
    status: 'connected',
    organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
    connectedBy: { id: 'test-user-id', name: 'Test User' },
    connectedAt: connectedAt.toISOString(),
    lastPolledAt: null,
    lastError: null,
  });

  await db.update(contractingJohnDeereConnection).set({ status: 'needs-reconnect', lastError: 'Refused' });
  expect(await johnDeere.status()).toMatchObject({ status: 'needs-reconnect', lastError: 'Refused' });

  await johnDeere.disconnect();
  expect(await johnDeere.status()).toMatchObject({ status: 'not-connected', organizations: [], connectedBy: null });
});

test('needs contracting_settings:update to read and Refresh, contracting_machine:update to link and unlink', async ({
  context: { createCaller, johnDeere: deps },
}) => {
  const id = '00000000-0000-4000-8000-000000000000';
  for (const session of [
    mockSession('admin'),
    contractingSession('contracting-manager'),
    contractingSession('foreman'),
  ]) {
    const johnDeere = createCaller(session, { contracting: { johnDeere: deps } }).contractingJohnDeere;
    await expect(johnDeere.status()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.connect.start()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.disconnect()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.equipment.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.equipment.refresh()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.links.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
  // The manager maintains the fleet, so reaches the service, which finds no such Link.
  const manager = createCaller(contractingSession('contracting-manager'), { contracting: { johnDeere: deps } });
  await expect(manager.contractingJohnDeere.links.remove({ id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  for (const session of [mockSession('admin'), contractingSession('foreman')]) {
    const johnDeere = createCaller(session, { contracting: { johnDeere: deps } }).contractingJohnDeere;
    await expect(johnDeere.links.create({ machineId: id, equipmentId: 'eq-1' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(johnDeere.links.remove({ id })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
});

test('a Link fills the Machine wire with its serial number and John Deere machine', async ({
  context: { createCaller, johnDeere: deps, db },
}) => {
  await connect(db);
  const caller = createCaller(contractingSession('contracting-admin'), { contracting: { johnDeere: deps } });
  const category = await caller.contractingFleet.categories.create({ name: 'Tractors', kind: 'machine' });
  const machine = await caller.contractingFleet.machines.create({
    code: 'T01',
    make: 'John Deere',
    model: '8R',
    categoryId: category.id,
  });
  expect(machine).toMatchObject({ serialNumber: null, johnDeere: null });

  expect(await caller.contractingJohnDeere.equipment.list()).toEqual([
    expect.objectContaining({ equipmentId: 'eq-1', lastHours: 812.3, lastReportTime: '2026-10-26T06:00:00.000Z' }),
  ]);
  await caller.contractingJohnDeere.links.create({ machineId: machine.id, equipmentId: 'eq-1' });
  await expect(
    caller.contractingJohnDeere.links.create({ machineId: machine.id, equipmentId: 'eq-1' }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });

  const linked = {
    serialNumber: 'PIN-1',
    johnDeere: {
      equipmentId: 'eq-1',
      principalId: 7,
      name: 'Big Green',
      lost: false,
      lastReportTime: null,
      lastValue: null,
    },
  };
  expect(await caller.contractingFleet.machines.get({ id: machine.id })).toMatchObject(linked);
  expect(await caller.contractingFleet.machines.list({})).toEqual([expect.objectContaining(linked)]);
  expect(await caller.contractingJohnDeere.equipment.list()).toEqual([]);

  const [link] = await caller.contractingJohnDeere.links.list();
  if (!link) throw new Error('No link');
  await caller.contractingJohnDeere.links.remove({ id: link.id });
  expect(await caller.contractingFleet.machines.get({ id: machine.id })).toMatchObject({
    serialNumber: 'PIN-1',
    johnDeere: null,
  });
});
