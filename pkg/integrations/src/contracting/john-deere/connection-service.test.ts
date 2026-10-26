import { randomBytes } from 'node:crypto';
import { auditEvents, type Db, eq, user } from '@pkg/db';
import { contractingJohnDeereConnection } from '@pkg/db/contracting';
import { describe, expect } from 'vitest';
import { test } from '../../test/tester.js';
import { JohnDeereClient } from './client.js';
import { JohnDeereConnectionService } from './connection-service.js';
import { decryptSecret } from './token-vault.js';

const tokenKey = randomBytes(32);
const redirectUri = 'https://api.example/api/contracting/john-deere/callback';
const connectionsReturnUri = `${redirectUri}?connections=done`;
const adminId = 'jd-admin';

type Organization = { id: string; name: string; connected: boolean };

/** A Deere stand-in: the token endpoint and the organization list, answering from mutable state. */
function deere() {
  const state = {
    now: new Date('2026-10-26T08:00:00.000Z'),
    organizations: [{ id: '4321', name: 'Jedidiah Boerdery', connected: true }] as Organization[],
    refreshRefused: false,
    issued: 0,
    grants: [] as Record<string, string>[],
  };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/v1/token')) {
      const grant = Object.fromEntries(new URLSearchParams(String(init?.body)));
      state.grants.push(grant);
      if (grant.grant_type === 'refresh_token' && state.refreshRefused)
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      state.issued += 1;
      return Response.json({
        access_token: `access-${state.issued}`,
        refresh_token: `refresh-${state.issued}`,
        expires_in: 43_200,
      });
    }
    if (url.includes('/organizations'))
      return Response.json({
        values: state.organizations.map(({ id, name, connected }) => ({
          id,
          name,
          links: [
            connected
              ? { rel: 'manage_connections', uri: 'https://connections.example/manage' }
              : { rel: 'connections', uri: 'https://connections.example/select' },
          ],
        })),
      });
    throw new Error(`Unexpected request ${url}`);
  };
  const client = new JohnDeereClient({
    platformBaseUrl: 'https://api.example/platform',
    equipmentBaseUrl: 'https://equipment.example/isg',
    issuer: 'https://signin.example/oauth2/aus',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetch,
    now: () => state.now,
  });
  return { state, client };
}

async function setUp(db: Db) {
  await db.insert(user).values({
    id: adminId,
    name: 'Jed Botha',
    email: 'jd-admin@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const { state, client } = deere();
  const service = new JohnDeereConnectionService({
    db,
    client,
    tokenKey,
    redirectUri,
    connectionsReturnUri,
    now: () => state.now,
  });
  const row = async () => {
    const [found] = await db.select().from(contractingJohnDeereConnection);
    return found;
  };
  const audit = () =>
    db.select().from(auditEvents).where(eq(auditEvents.entityType, 'contracting_john_deere_connection'));
  const stateOf = (url: string) => new URL(url).searchParams.get('state') ?? '';
  /** Start then complete one round trip, as the callback's first leg does. */
  const connect = async () => {
    const { url } = await service.startConnect({ actorUserId: adminId });
    return service.completeConnect({ code: 'c', state: stateOf(url) });
  };
  return { state, service, row, audit, stateOf, connect };
}

describe('JohnDeereConnectionService', () => {
  test('start then complete connects, storing the refresh token encrypted and auditing no credential', async ({
    db,
  }) => {
    const { state, service, row, audit, stateOf } = await setUp(db);
    const { url } = await service.startConnect({ actorUserId: adminId });
    expect(stateOf(url)).toMatch(/^connect:[0-9a-f]{32}$/);
    expect((await row())?.status).toBe('pending');

    expect(await service.completeConnect({ code: 'the-code', state: stateOf(url) })).toEqual({
      status: 'connected',
      connectionsUrl: null,
    });
    const stored = await row();
    expect(stored).toMatchObject({ status: 'connected', pendingState: null, scopes: 'eq1 offline_access' });
    expect(decryptSecret(stored?.refreshTokenCiphertext ?? '', tokenKey)).toBe('refresh-1');
    expect(await service.getConnection()).toEqual({
      status: 'connected',
      organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
      connectedBy: { id: adminId, name: 'Jed Botha' },
      connectedAt: state.now.toISOString(),
      lastPolledAt: null,
      lastError: null,
    });
    expect(state.grants[0]).toMatchObject({
      grant_type: 'authorization_code',
      code: 'the-code',
      redirect_uri: redirectUri,
    });

    const events = await audit();
    expect(events.map((event) => [event.action, event.actorUserId])).toEqual([
      ['created', adminId],
      ['updated', adminId],
    ]);
    const logged = JSON.stringify(events);
    for (const secret of [stored?.refreshTokenCiphertext, 'refresh-1', stateOf(url)])
      expect(logged).not.toContain(secret);
  });

  test('refuses a state that does not match or has expired', async ({ db }) => {
    const { state, service, stateOf } = await setUp(db);
    await expect(service.completeConnect({ code: 'c', state: 'connect:forged' })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });
    const { url } = await service.startConnect({ actorUserId: adminId });
    await expect(service.completeConnect({ code: 'c', state: 'connect:forged' })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });
    state.now = new Date(state.now.getTime() + 11 * 60 * 1000);
    await expect(service.completeConnect({ code: 'c', state: stateOf(url) })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });
    expect(state.grants).toEqual([]);
  });

  test('sends an unconnected organization through the picker, then finishes from the open round trip', async ({
    db,
  }) => {
    const { state, service, row, stateOf } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    const { url } = await service.startConnect({ actorUserId: adminId });

    const first = await service.completeConnect({ code: 'c', state: stateOf(url) });
    expect(first.status).toBe('pending');
    expect(first.connectionsUrl).toBe(
      `https://connections.example/select?redirect_uri=${encodeURIComponent(connectionsReturnUri)}`,
    );
    expect((await row())?.pendingState).toBe(stateOf(url));

    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: true }];
    expect(await service.finishConnect()).toEqual({ status: 'connected' });
    expect(await row()).toMatchObject({
      pendingState: null,
      organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
    });
    await expect(service.finishConnect()).rejects.toMatchObject({ code: 'john_deere.invalid_state' });
  });

  test('finishes as Needs reconnecting when the organization is still not connected', async ({ db }) => {
    const { state, service, connect } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    await connect();

    expect(await service.finishConnect()).toEqual({ status: 'needs-reconnect' });
    expect(await service.getConnection()).toMatchObject({
      status: 'needs-reconnect',
      organizations: [],
      lastError: expect.stringContaining('No John Deere organization'),
    });
  });

  test('caches the access token, refreshes once near expiry, and marks a refused refresh Needs reconnecting', async ({
    db,
  }) => {
    const { state, service, row, connect } = await setUp(db);
    await connect();

    expect(await service.accessToken()).toBe('access-1');
    state.now = new Date(state.now.getTime() + 12 * 60 * 60 * 1000 - 4 * 60 * 1000);
    expect(await Promise.all([service.accessToken(), service.accessToken()])).toEqual(['access-2', 'access-2']);
    expect(state.grants.filter((grant) => grant.grant_type === 'refresh_token')).toEqual([
      expect.objectContaining({ refresh_token: 'refresh-1', redirect_uri: redirectUri, scope: 'eq1 offline_access' }),
    ]);
    expect(decryptSecret((await row())?.refreshTokenCiphertext ?? '', tokenKey)).toBe('refresh-2');

    state.refreshRefused = true;
    state.now = new Date(state.now.getTime() + 12 * 60 * 60 * 1000);
    await expect(service.accessToken()).rejects.toMatchObject({ code: 'john_deere.unauthorized' });
    expect(await service.getConnection()).toMatchObject({ status: 'needs-reconnect', lastError: expect.any(String) });
    await expect(service.accessToken()).rejects.toMatchObject({ code: 'john_deere.not_connected' });
  });

  test('disconnect forgets the tokens and organizations; poll marks record without auditing the timestamp', async ({
    db,
  }) => {
    const { state, service, row, audit, connect } = await setUp(db);
    await connect();

    await service.markPolled();
    await service.markError({ message: 'John Deere is unavailable right now.' });
    expect(await service.getConnection()).toMatchObject({
      lastPolledAt: state.now.toISOString(),
      lastError: 'John Deere is unavailable right now.',
    });
    const beforeDisconnect = (await audit()).length;

    await service.disconnect({ actorUserId: adminId });
    expect(await row()).toMatchObject({
      status: 'not-connected',
      refreshTokenCiphertext: null,
      organizations: [],
      connectedByUserId: null,
      lastError: null,
    });
    expect((await audit()).length).toBe(beforeDisconnect + 1);
    await expect(service.accessToken()).rejects.toMatchObject({ code: 'john_deere.not_connected' });
  });
});
