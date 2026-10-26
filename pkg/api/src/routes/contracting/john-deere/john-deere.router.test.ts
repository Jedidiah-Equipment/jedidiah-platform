import { randomBytes } from 'node:crypto';
import { contractingJohnDeereConnection } from '@pkg/db/contracting';
import {
  encryptSecret,
  JohnDeereClient,
  JohnDeereConnectionService,
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
    fetch: async () => {
      throw new Error('No Deere call expected');
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
  return { connection, db };
});

const contractingSession = (role: Parameters<typeof sessionAs>[1]) => sessionAs('test-user-id', role);

test('status reads Not configured when the environment has no John Deere keys', async ({ context }) => {
  const johnDeere = context.createCaller(mockSession('super-admin')).contractingJohnDeere;
  expect(await johnDeere.status()).toEqual({ configured: false, ...NOT_CONNECTED });
  await expect(johnDeere.connect.start()).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
});

test('status reads every connection state', async ({ context: { createCaller, connection, db } }) => {
  const johnDeere = createCaller(contractingSession('contracting-admin'), {
    contracting: { johnDeere: { connection } },
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

test('needs contracting_settings:update for every procedure', async ({ context: { createCaller, connection } }) => {
  for (const session of [
    mockSession('admin'),
    contractingSession('contracting-manager'),
    contractingSession('foreman'),
  ]) {
    const johnDeere = createCaller(session, { contracting: { johnDeere: { connection } } }).contractingJohnDeere;
    await expect(johnDeere.status()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.connect.start()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(johnDeere.disconnect()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  }
});
