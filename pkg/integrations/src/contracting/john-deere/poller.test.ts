import { randomBytes } from 'node:crypto';
import { type Db, eq, user } from '@pkg/db';
import {
  contractingCategories,
  contractingHourReadings,
  contractingJohnDeereConnection,
  contractingJohnDeereLinks,
  contractingMachines,
} from '@pkg/db/contracting';
import type { ContractingPushEvent } from '@pkg/domain/contracting';
import { describe, expect, vi } from 'vitest';
import { test } from '../../test/tester.js';
import { JohnDeereClient } from './client.js';
import { JohnDeereConnectionService } from './connection-service.js';
import { JohnDeereLinkService } from './link-service.js';
import { JohnDeerePoller, type JohnDeerePollerConfig } from './poller.js';
import { encryptSecret } from './token-vault.js';

const tokenKey = randomBytes(32);
const adminId = 'poll-admin';

const deereMachine = (id: string, principalId: number, overrides: Record<string, unknown> = {}) => ({
  id,
  principalId,
  name: `Deere ${id}`,
  serialNumber: `PIN-${id}`,
  organization: [{ id: 4321 }],
  telematicsCapable: true,
  archived: false,
  devices: [{ '@type': 'TelematicsGateway' }],
  ...overrides,
});

type Failure = { status: number; headers?: Record<string, string>; body?: unknown };

/** A Deere stand-in whose lists, hours and failures the test mutates between polls. */
function deere() {
  const state = {
    now: new Date('2026-09-07T10:00:00.000Z'),
    machines: [deereMachine('eq-1', 1), deereMachine('eq-2', 2)] as Record<string, unknown>[],
    hours: new Map<number, { hours: number; reportTime: string }>([
      [1, { hours: 1000.96, reportTime: '2026-09-07T08:00:00.000Z' }],
      [2, { hours: 500, reportTime: '2026-09-07T08:30:00.000Z' }],
    ]),
    /** Answers an engine-hours call for a principal with a failure, once per entry, before the normal answer. */
    failures: new Map<number, Failure[]>(),
    /** Token requests after this many have been issued are refused as a spent grant. */
    refuseTokensAfter: Number.POSITIVE_INFINITY,
    hoursCalls: [] as number[],
    refreshes: 0,
    gate: null as Promise<void> | null,
  };
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/v1/token')) {
      if (state.refreshes >= state.refuseTokensAfter) return Response.json({ error: 'invalid_grant' }, { status: 400 });
      state.refreshes += 1;
      return Response.json({
        access_token: `access-${state.refreshes}`,
        refresh_token: 'refresh',
        expires_in: 43_200,
      });
    }
    if (url.pathname.endsWith('/equipment')) {
      const ids = new Set(url.searchParams.get('ids')?.split(','));
      return Response.json({ values: state.machines.filter((machine) => ids.has(String(machine.id))) });
    }
    const principal = Number(/machines\/(\d+)\/engineHours/.exec(url.pathname)?.[1]);
    state.hoursCalls.push(principal);
    if (state.gate) await state.gate;
    const failure = state.failures.get(principal)?.shift();
    if (failure)
      return new Response(JSON.stringify(failure.body ?? {}), {
        status: failure.status,
        ...(failure.headers ? { headers: failure.headers } : {}),
      });
    const report = state.hours.get(principal);
    return Response.json({
      values: report ? [{ reading: { valueAsDouble: report.hours }, reportTime: report.reportTime, source: 'TM' }] : [],
    });
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

async function setUp(db: Db, { connected = true, links = 2 }: { connected?: boolean; links?: number } = {}) {
  await db.insert(user).values({
    id: adminId,
    name: 'Jed Botha',
    email: 'poll-admin@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  if (connected)
    await db.insert(contractingJohnDeereConnection).values({
      status: 'connected',
      refreshTokenCiphertext: encryptSecret('refresh', tokenKey),
      organizations: [{ id: '4321', name: 'Jedidiah Boerdery' }],
    });
  const [category] = await db
    .insert(contractingCategories)
    .values({ name: 'Tractor', kind: 'machine', icon: 'tractor', colour: 'lime' })
    .returning();
  if (!category) throw new Error('No category');
  const linked: { machineId: string; linkId: string }[] = [];
  for (let index = 1; index <= links; index++) {
    const [machine] = await db
      .insert(contractingMachines)
      .values({
        code: `T0${index}`,
        make: 'John Deere',
        model: '8R',
        categoryId: category.id,
        nextServiceDueHours: index === 1 ? 1050 : null,
      })
      .returning();
    if (!machine) throw new Error('No machine');
    const [link] = await db
      .insert(contractingJohnDeereLinks)
      .values({
        machineId: machine.id,
        equipmentId: `eq-${index}`,
        principalId: index,
        organizationId: '4321',
        deereName: `Deere eq-${index}`,
        linkedByUserId: adminId,
        linkedAt: new Date('2026-09-01T00:00:00Z'),
      })
      .returning();
    if (!link) throw new Error('No link');
    linked.push({ machineId: machine.id, linkId: link.id });
  }
  const { state, client } = deere();
  const now = () => state.now;
  const connection = new JohnDeereConnectionService({
    db,
    client,
    tokenKey,
    redirectUri: 'https://api.example/callback',
    connectionsReturnUri: 'https://api.example/callback?connections=done',
    now,
  });
  const linkService = new JohnDeereLinkService({ db, client, connection, now });
  const pushed: ContractingPushEvent[] = [];
  const sleeps: number[] = [];
  const warnings: string[] = [];
  const poller = (
    overrides: Partial<JohnDeerePollerConfig> = {},
    { realSleep = false }: { realSleep?: boolean } = {},
  ) => {
    const config: JohnDeerePollerConfig = {
      db,
      client,
      connection,
      links: linkService,
      push: { schedule: (event) => pushed.push(event) },
      logger: {
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: (_data, message) => warnings.push(message ?? ''),
        error: () => {},
      },
      now,
      intervalMs: 3_600_000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      ...overrides,
    };
    if (realSleep) delete config.sleep;
    return new JohnDeerePoller(config);
  };
  return { state, connection, linked, poller, pushed, sleeps, warnings };
}

/** Holds every engine-hours answer until the returned function lets them through. */
const holdDeere = (state: { gate: Promise<void> | null }) => {
  let release: () => void = () => {};
  state.gate = new Promise((resolve) => {
    release = resolve;
  });
  return release;
};

const readings = (db: Db) => db.select().from(contractingHourReadings).orderBy(contractingHourReadings.sequence);
const linkRow = async (db: Db, linkId: string) => {
  const [row] = await db.select().from(contractingJohnDeereLinks).where(eq(contractingJohnDeereLinks.id, linkId));
  if (!row) throw new Error('No link row');
  return row;
};
const connectionRow = async (db: Db) => {
  const [row] = await db.select().from(contractingJohnDeereConnection);
  if (!row) throw new Error('No connection row');
  return row;
};

describe('JohnDeerePoller', () => {
  test('stores each Link’s hours as a Telematics Reading, records the Link and warns when service is due soon', async ({
    db,
  }) => {
    const { poller, linked, pushed } = await setUp(db);
    const summary = await poller().pollOnce();

    expect(summary).toEqual({
      skipped: null,
      polled: 2,
      stored: 2,
      moved: 0,
      unchanged: 0,
      lost: 0,
      errors: 0,
      endedBy: null,
    });
    expect(await readings(db)).toMatchObject([
      { machineId: linked[0]?.machineId, value: 1000.9, method: 'telematics', capturedByUserId: null },
      { machineId: linked[1]?.machineId, value: 500, method: 'telematics', telematicsLinkId: linked[1]?.linkId },
    ]);
    expect(await linkRow(db, linked[0]?.linkId ?? '')).toMatchObject({
      lastValue: 1000.9,
      lastReportTime: new Date('2026-09-07T08:00:00Z'),
      lastPolledAt: new Date('2026-09-07T10:00:00Z'),
      lastError: null,
    });
    expect(await connectionRow(db)).toMatchObject({ lastPolledAt: new Date('2026-09-07T10:00:00Z'), lastError: null });
    // 49.1 h to the 1050 h service sticker is inside the default threshold; the other Machine has no sticker.
    expect(pushed).toEqual([{ kind: 'machine.service-due-soon', machineId: linked[0]?.machineId }]);
  });

  test('moves the Read At forward when the same value is reported again', async ({ db }) => {
    const { poller, state, pushed } = await setUp(db);
    await poller().pollOnce();
    state.hours.set(1, { hours: 1000.96, reportTime: '2026-09-07T09:00:00.000Z' });
    state.hours.set(2, { hours: 501, reportTime: '2026-09-07T09:00:00.000Z' });
    const summary = await poller().pollOnce();

    expect(summary).toMatchObject({ stored: 1, moved: 1 });
    expect((await readings(db)).map((row) => [row.value, row.capturedAt.toISOString()])).toEqual([
      [1000.9, '2026-09-07T09:00:00.000Z'],
      [500, '2026-09-07T08:30:00.000Z'],
      [501, '2026-09-07T09:00:00.000Z'],
    ]);
    // Service Due Soon fired once, on the first poll.
    expect(pushed).toHaveLength(1);
  });

  test('marks a Link lost while Deere does not list or archives its machine, and found when it returns', async ({
    db,
  }) => {
    const { poller, state, linked } = await setUp(db);
    state.machines = [deereMachine('eq-1', 1, { archived: true })];
    const lost = await poller().pollOnce();
    expect(lost).toMatchObject({ polled: 0, lost: 2 });
    expect(state.hoursCalls).toEqual([]);
    expect((await linkRow(db, linked[0]?.linkId ?? '')).lostAt).toEqual(new Date('2026-09-07T10:00:00Z'));

    state.machines = [deereMachine('eq-1', 1), deereMachine('eq-2', 2)];
    const found = await poller().pollOnce();
    expect(found).toMatchObject({ polled: 2, lost: 0, stored: 2 });
    expect((await linkRow(db, linked[0]?.linkId ?? '')).lostAt).toBeNull();
  });

  test('marks a Link lost on a 404 and carries on with the rest', async ({ db }) => {
    const { poller, state, linked } = await setUp(db);
    state.failures.set(1, [{ status: 404 }]);
    const summary = await poller().pollOnce();
    expect(summary).toMatchObject({ lost: 1, stored: 1, errors: 0 });
    expect((await linkRow(db, linked[0]?.linkId ?? '')).lostAt).not.toBeNull();
  });

  test('records a Link’s own error and continues with the next', async ({ db }) => {
    const { poller, state, linked, warnings } = await setUp(db);
    state.failures.set(1, [{ status: 400, body: { message: 'nope' } }]);
    const summary = await poller().pollOnce();
    expect(summary).toMatchObject({ errors: 1, stored: 1, endedBy: null });
    expect(await linkRow(db, linked[0]?.linkId ?? '')).toMatchObject({ lastError: expect.stringContaining('400') });
    expect(warnings).toEqual(['John Deere poll failed for a Link']);
    expect(await connectionRow(db)).toMatchObject({ lastError: null });

    // The next clean poll clears it.
    await poller().pollOnce();
    expect((await linkRow(db, linked[0]?.linkId ?? '')).lastError).toBeNull();
  });

  test('renews the access token once on a 401 and retries', async ({ db }) => {
    const { poller, state } = await setUp(db);
    state.failures.set(1, [{ status: 401 }]);
    const summary = await poller().pollOnce();
    expect(summary).toMatchObject({ stored: 2, errors: 0, endedBy: null });
    // One token for the run, one renewal.
    expect(state.refreshes).toBe(2);
    expect(state.hoursCalls).toEqual([1, 1, 2]);
  });

  test('ends the run and leaves the connection Needs reconnecting when the renewal is refused', async ({ db }) => {
    const { poller, state } = await setUp(db);
    state.refuseTokensAfter = 1;
    state.failures.set(1, [{ status: 401 }]);
    const summary = await poller().pollOnce();
    expect(summary).toMatchObject({ stored: 0, endedBy: 'John Deere refused the sign-in. Reconnect John Deere.' });
    expect(state.hoursCalls).toEqual([1]);
    expect(await readings(db)).toEqual([]);
    expect(await connectionRow(db)).toMatchObject({ status: 'needs-reconnect' });

    // Needs reconnecting is not Connected: the next hour skips until someone reconnects.
    expect(await poller().pollOnce()).toMatchObject({ skipped: 'not-connected' });
  });

  test('waits the Retry-After Deere named, retries the Link once, and ends the run on a second 429', async ({ db }) => {
    const { poller, state, sleeps } = await setUp(db);
    state.failures.set(1, [{ status: 429, headers: { 'Retry-After': '7' } }]);
    expect(await poller().pollOnce()).toMatchObject({ stored: 2, endedBy: null });
    expect(sleeps).toEqual([7000]);

    state.failures.set(1, [
      { status: 429, headers: { 'Retry-After': '9999' } },
      { status: 429, headers: { 'Retry-After': '9999' } },
    ]);
    state.hours.set(1, { hours: 1100, reportTime: '2026-09-07T09:30:00.000Z' });
    const ended = await poller().pollOnce();
    expect(sleeps).toEqual([7000, 300_000]);
    expect(ended).toMatchObject({ endedBy: 'John Deere is limiting requests.' });
    // The second Link never ran this time.
    expect(state.hoursCalls.slice(-2)).toEqual([1, 1]);
    expect(await connectionRow(db)).toMatchObject({ lastError: 'John Deere is limiting requests.' });
  });

  test('ends the run with the error on the connection when Deere is unavailable', async ({ db }) => {
    const { poller, state } = await setUp(db);
    state.failures.set(1, [{ status: 503 }]);
    const summary = await poller().pollOnce();
    expect(summary).toMatchObject({ stored: 0, endedBy: 'John Deere is unavailable right now.' });
    expect(state.hoursCalls).toEqual([1]);
    expect(await connectionRow(db)).toMatchObject({
      lastError: 'John Deere is unavailable right now.',
      lastPolledAt: new Date('2026-09-07T10:00:00Z'),
    });
  });

  test('leaves a Link as it was when Deere reports a time in the future', async ({ db }) => {
    const { poller, state, linked, warnings } = await setUp(db);
    state.hours.set(1, { hours: 1000, reportTime: '2026-09-07T10:30:00.000Z' });
    const summary = await poller().pollOnce();
    expect(summary).toMatchObject({ stored: 1, unchanged: 1 });
    expect(warnings).toEqual(['John Deere reported a time in the future']);
    expect(await linkRow(db, linked[0]?.linkId ?? '')).toMatchObject({
      lastPolledAt: new Date('2026-09-07T10:00:00Z'),
      lastReportTime: null,
      lastValue: null,
    });
    expect(await readings(db)).toHaveLength(1);
  });

  test('skips and never calls Deere when nothing is connected', async ({ db }) => {
    const { poller, state } = await setUp(db, { connected: false });
    expect(await poller().pollOnce()).toMatchObject({ skipped: 'not-connected', polled: 0 });
    expect(state.hoursCalls).toEqual([]);
  });

  test('skips when no Machine is linked', async ({ db }) => {
    const { poller } = await setUp(db, { links: 0 });
    expect(await poller().pollOnce()).toMatchObject({ skipped: 'no-links' });
  });

  test('runNow joins a poll already running instead of starting a second', async ({ db }) => {
    const { poller, state } = await setUp(db);
    const release = holdDeere(state);
    const run = poller();
    const first = run.runNow();
    const second = run.runNow();
    expect(second).toBe(first);
    release();
    expect(await first).toMatchObject({ stored: 2 });
    expect(state.hoursCalls).toEqual([1, 2]);
    // Once finished, the next call is a new run.
    const next = run.runNow();
    expect(next).not.toBe(first);
    await next;
  });

  test('dispose cuts a Retry-After wait short and ends the run without touching the connection row', async ({ db }) => {
    const { poller, state } = await setUp(db);
    state.failures.set(1, [{ status: 429, headers: { 'Retry-After': '300' } }]);
    const run = poller({}, { realSleep: true });
    const running = run.runNow();
    await vi.waitFor(() => expect(state.hoursCalls).toEqual([1]));
    await run.dispose();
    expect(await running).toMatchObject({ endedBy: 'John Deere polling stopped as the API shut down.', stored: 0 });
    expect(state.hoursCalls).toEqual([1]);
    expect(await connectionRow(db)).toMatchObject({ lastError: null });
  });

  test('start polls after the first delay and dispose waits for the Link in flight', async ({ db }) => {
    const { poller, state } = await setUp(db);
    const release = holdDeere(state);
    const run = poller({ firstRunDelayMs: 5, intervalMs: 3_600_000 });
    run.start();
    await vi.waitFor(() => expect(state.hoursCalls).toEqual([1]));

    let disposed = false;
    const disposing = run.dispose().then(() => {
      disposed = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(disposed).toBe(false);
    release();
    await disposing;
    // The Link in flight finishes; the rest wait for the next run.
    expect(await readings(db)).toHaveLength(1);
  });
});
