import { randomBytes } from 'node:crypto';
import { auditEvents, type Db, eq, user } from '@pkg/db';
import { contractingJohnDeereConnection } from '@pkg/db/contracting';
import { describe, expect, vi } from 'vitest';
import { test } from '../../test/tester.js';
import { JohnDeereClient } from './client.js';
import { JohnDeereConnectionService } from './connection-service.js';
import { JohnDeereError } from './john-deere-errors.js';
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
    organizationReads: 0,
    /** The organization read on which every organization turns connected, as Deere's list catches up. */
    connectOnRead: null as number | null,
    /** Organization reads up to this one list every organization with no link at all, as a lagging Deere does. */
    linklessThroughRead: 0,
    /** How often the service paused before re-reading the organization list. */
    slept: 0,
    /** Holds every refresh until it resolves, to land a write between the Deere call and its own. */
    holdRefresh: null as Promise<void> | null,
    issued: 0,
    grants: [] as Record<string, string>[],
  };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/v1/token')) {
      const grant = Object.fromEntries(new URLSearchParams(String(init?.body)));
      state.grants.push(grant);
      if (grant.grant_type === 'refresh_token' && state.holdRefresh) await state.holdRefresh;
      if (grant.grant_type === 'refresh_token' && state.refreshRefused)
        return Response.json({ error: 'invalid_grant' }, { status: 400 });
      state.issued += 1;
      return Response.json({
        access_token: `access-${state.issued}`,
        refresh_token: `refresh-${state.issued}`,
        expires_in: 43_200,
      });
    }
    if (url.includes('/organizations')) {
      state.organizationReads += 1;
      if (state.connectOnRead === state.organizationReads)
        state.organizations = state.organizations.map((organization) => ({ ...organization, connected: true }));
      return Response.json({
        values: state.organizations.map(({ id, name, connected }) => ({
          id,
          name,
          links:
            state.organizationReads <= state.linklessThroughRead
              ? []
              : [
                  connected
                    ? { rel: 'manage_connection', uri: 'https://connections.example/manage' }
                    : { rel: 'connections', uri: 'https://connections.example/select' },
                ],
        })),
      });
    }
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
    sleep: async () => {
      state.slept += 1;
    },
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
      connected: true,
      picker: null,
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

  test('sends an unconnected organization through the picker, admitting the return only with its token', async ({
    db,
  }) => {
    const { state, service, row, stateOf } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    const { url } = await service.startConnect({ actorUserId: adminId });
    // Before the code leg there is nothing to return to.
    await expect(service.finishConnect({ returnToken: stateOf(url) })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });

    const { connected, picker } = await service.completeConnect({ code: 'c', state: stateOf(url) });
    expect(connected).toBe(false);
    expect(picker?.url).toBe(
      `https://connections.example/select?redirect_uri=${encodeURIComponent(connectionsReturnUri)}`,
    );
    expect(picker?.returnToken).toMatch(/^return:[0-9a-f]{32}$/);
    expect(await row()).toMatchObject({ status: 'pending', refreshTokenCiphertext: null });
    await expect(service.finishConnect({ returnToken: 'return:forged' })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });

    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: true }];
    expect(await service.finishConnect({ returnToken: picker?.returnToken ?? '' })).toEqual({ connected: true });
    const stored = await row();
    expect(stored).toMatchObject({
      status: 'connected',
      pendingState: null,
      pendingRefreshTokenCiphertext: null,
      organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
    });
    expect(decryptSecret(stored?.refreshTokenCiphertext ?? '', tokenKey)).toBe('refresh-2');
    await expect(service.finishConnect({ returnToken: picker?.returnToken ?? '' })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });
  });

  test('finishes Not connected, saying why, when the organization is still not connected', async ({ db }) => {
    const { state, service, connect } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    const { picker } = await connect();

    expect(await service.finishConnect({ returnToken: picker?.returnToken ?? '' })).toEqual({ connected: false });
    expect(await service.getConnection()).toMatchObject({
      status: 'not-connected',
      organizations: [],
      connectedBy: null,
      connectedAt: null,
      lastError:
        'No John Deere organization has given Jedidiah access. Reconnect and choose the organization. ' +
        'John Deere listed: Jedidiah Boerdery (connections).',
    });
    // The code leg had a link to act on; the picker leg paused and read once more before giving up.
    expect(state).toMatchObject({ organizationReads: 3, slept: 1 });
  });

  test('the picker leg reads the organization list once more when Deere has not caught up yet', async ({ db }) => {
    const { state, service, connect } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    const { picker } = await connect();
    state.connectOnRead = 3;

    expect(await service.finishConnect({ returnToken: picker?.returnToken ?? '' })).toEqual({ connected: true });
    expect(state).toMatchObject({ organizationReads: 3, slept: 1 });
    expect(await service.getConnection()).toMatchObject({
      status: 'connected',
      organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
      lastError: null,
    });
  });

  test('the code leg reads once more when Deere lists the organization with no link yet', async ({ db }) => {
    const { state, service, connect, row } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    state.linklessThroughRead = 1;

    // The second read carries the picker link, so the leg opens the picker instead of giving up.
    const { connected, picker } = await connect();
    expect(connected).toBe(false);
    expect(picker?.url).toBe(
      `https://connections.example/select?redirect_uri=${encodeURIComponent(connectionsReturnUri)}`,
    );
    expect(state).toMatchObject({ organizationReads: 2, slept: 1 });
    expect(await row()).toMatchObject({ status: 'pending', lastError: null });

    // A leg that can act on its first read never pauses: here the organization is already connected.
    state.linklessThroughRead = 0;
    state.connectOnRead = 3;
    expect(await service.finishConnect({ returnToken: picker?.returnToken ?? '' })).toEqual({ connected: true });
    expect(state).toMatchObject({ organizationReads: 3, slept: 1 });
  });

  test('the code leg gives up, naming an organization with no links, when the re-read shows none either', async ({
    db,
  }) => {
    const { state, connect, row } = await setUp(db);
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    state.linklessThroughRead = 2;

    expect(await connect()).toEqual({ connected: false, picker: null });
    expect(state).toMatchObject({ organizationReads: 2, slept: 1 });
    expect(await row()).toMatchObject({
      status: 'not-connected',
      lastError: expect.stringContaining('John Deere listed: Jedidiah Boerdery (no links).'),
    });
  });

  test('a Reconnect changes nothing until Deere answers, then credits whoever reconnected', async ({ db }) => {
    const { state, service, row, connect, stateOf } = await setUp(db);
    await connect();
    await db.insert(user).values({
      id: 'jd-second',
      name: 'Anna Botha',
      email: 'jd-second@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Abandoned in the picker: still Connected, still Jed's sign-in and Jed's credit.
    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: false }];
    const abandoned = await service.startConnect({ actorUserId: 'jd-second' });
    expect(await service.completeConnect({ code: 'c', state: stateOf(abandoned.url) })).toMatchObject({
      connected: false,
    });
    expect(await service.getConnection()).toMatchObject({ status: 'connected', connectedBy: { id: adminId } });
    expect(decryptSecret((await row())?.refreshTokenCiphertext ?? '', tokenKey)).toBe('refresh-1');

    state.organizations = [{ id: '4321', name: 'Jedidiah Boerdery', connected: true }];
    const finished = await service.startConnect({ actorUserId: 'jd-second' });
    await service.completeConnect({ code: 'c', state: stateOf(finished.url) });
    expect(await service.getConnection()).toMatchObject({ status: 'connected', connectedBy: { id: 'jd-second' } });
  });

  test('a callback or refresh that a Disconnect overtook writes nothing back', async ({ db }) => {
    const { state, service, row, connect, stateOf } = await setUp(db);
    await connect();

    let release: () => void = () => undefined;
    state.holdRefresh = new Promise<void>((resolve) => {
      release = resolve;
    });
    state.now = new Date(state.now.getTime() + 12 * 60 * 60 * 1000);
    const refreshing = service.accessToken();
    await service.disconnect({ actorUserId: adminId });
    release();
    await expect(refreshing).rejects.toMatchObject({ code: 'john_deere.not_connected' });
    expect(await row()).toMatchObject({ status: 'not-connected', refreshTokenCiphertext: null });
    await expect(service.accessToken()).rejects.toMatchObject({ code: 'john_deere.not_connected' });

    state.holdRefresh = null;
    const { url } = await service.startConnect({ actorUserId: adminId });
    const newer = await service.startConnect({ actorUserId: adminId });
    await expect(service.completeConnect({ code: 'c', state: stateOf(url) })).rejects.toMatchObject({
      code: 'john_deere.invalid_state',
    });
    expect((await row())?.pendingState).toBe(stateOf(newer.url));
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

  test('a call renews the token once when Deere refuses it, and a refused refresh is the refusal itself', async ({
    db,
  }) => {
    const { state, service, connect } = await setUp(db);
    await connect();
    const seen: string[] = [];
    const refusedOnce = async (token: string) => {
      seen.push(token);
      if (seen.length === 1) throw new JohnDeereError('john_deere.unauthorized', 'John Deere refused the sign-in.');
      return 'read';
    };
    expect(await service.withAccessToken(refusedOnce)).toBe('read');
    expect(seen).toEqual(['access-1', 'access-2']);

    // The token has expired and Deere refuses to refresh it: the call never runs and the reason says Reconnect.
    state.refreshRefused = true;
    state.now = new Date(state.now.getTime() + 12 * 60 * 60 * 1000);
    const never = vi.fn(async () => 'read');
    await expect(service.withAccessToken(never)).rejects.toMatchObject({
      code: 'john_deere.unauthorized',
      message: 'John Deere refused the sign-in. Reconnect John Deere.',
    });
    expect(never).not.toHaveBeenCalled();
    expect(await service.getConnection()).toMatchObject({ status: 'needs-reconnect' });
  });

  test('disconnect forgets the tokens and organizations; a poll records only on a Connected row, unaudited', async ({
    db,
  }) => {
    const { state, service, row, audit, connect } = await setUp(db);
    await connect();

    await service.recordPoll({ error: 'John Deere is unavailable right now.' });
    expect(await service.getConnection()).toMatchObject({
      lastPolledAt: state.now.toISOString(),
      lastError: 'John Deere is unavailable right now.',
    });
    await service.recordPoll({ error: null });
    expect(await service.getConnection()).toMatchObject({ lastPolledAt: state.now.toISOString(), lastError: null });
    const beforeDisconnect = (await audit()).length;

    await service.disconnect({ actorUserId: adminId });
    // A poll that ends after a Disconnect, or a refused renewal, records nothing: the row already says why.
    await service.recordPoll({ error: 'John Deere refused the sign-in.' });
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
