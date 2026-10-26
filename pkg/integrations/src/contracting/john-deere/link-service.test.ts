import { randomBytes } from 'node:crypto';
import { auditEvents, type Db, eq, user } from '@pkg/db';
import {
  contractingCategories,
  contractingHourReadings,
  contractingJohnDeereConnection,
  contractingJohnDeereLinks,
  contractingMachines,
} from '@pkg/db/contracting';
import { describe, expect } from 'vitest';
import { test } from '../../test/tester.js';
import { type DeereMachine, JohnDeereClient } from './client.js';
import { JohnDeereConnectionService } from './connection-service.js';
import { JohnDeereLinkService } from './link-service.js';
import { encryptSecret } from './token-vault.js';

const tokenKey = randomBytes(32);
const adminId = 'jd-admin';

const deereMachine = (id: string, overrides: Partial<DeereMachine> = {}) => ({
  id,
  principalId: Number(id.replace(/\D/g, '')) || 1,
  name: `Deere ${id}`,
  serialNumber: `PIN-${id}`,
  modelYear: '2022',
  make: { name: 'JOHN DEERE' },
  model: { name: '8R 410' },
  organization: [{ id: 4321 }],
  telematicsCapable: true,
  archived: false,
  devices: [{ '@type': 'TelematicsGateway' }],
  ...overrides,
});

/** A Deere stand-in answering the token endpoint, the equipment list and engine hours from mutable state. */
function deere() {
  const state = {
    now: new Date('2026-10-26T08:00:00.000Z'),
    machines: [deereMachine('eq-1'), deereMachine('eq-2', { name: 'Alpha' })] as Record<string, unknown>[],
    hours: new Map<number, { hours: number; reportTime: string }>([
      [1, { hours: 1200.5, reportTime: '2026-10-26T06:00:00.000Z' }],
    ]),
    calls: [] as string[],
  };
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/v1/token'))
      return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 43_200 });
    state.calls.push(url.pathname);
    if (url.pathname.endsWith('/equipment')) return Response.json({ values: state.machines });
    const principal = /machines\/(\d+)\/engineHours/.exec(url.pathname)?.[1];
    if (principal) {
      const report = state.hours.get(Number(principal));
      return Response.json({
        values: report
          ? [{ reading: { valueAsDouble: report.hours }, reportTime: report.reportTime, source: 'TM' }]
          : [],
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
  const machine = async (code: string, extra: Partial<typeof contractingMachines.$inferInsert> = {}) => {
    const [row] = await db
      .insert(contractingMachines)
      .values({ code, make: 'John Deere', model: '8R', categoryId: category.id, ...extra })
      .returning();
    if (!row) throw new Error('No machine');
    return row;
  };
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
  const service = new JohnDeereLinkService({ db, client, connection, now });
  return { state, service, machine };
}

const links = (db: Db) => db.select().from(contractingJohnDeereLinks).orderBy(contractingJohnDeereLinks.linkedAt);

describe('JohnDeereLinkService', () => {
  test('lists unlinked machines by name with their last reported hours', async ({ db }) => {
    const { service, machine } = await setUp(db);
    expect(await service.listUnlinkedMachines()).toEqual([
      expect.objectContaining({ equipmentId: 'eq-2', name: 'Alpha', lastHours: null, lastReportTime: null }),
      {
        equipmentId: 'eq-1',
        principalId: 1,
        name: 'Deere eq-1',
        serialNumber: 'PIN-eq-1',
        make: 'JOHN DEERE',
        model: '8R 410',
        modelYear: '2022',
        lastHours: 1200.5,
        lastReportTime: '2026-10-26T06:00:00.000Z',
      },
    ]);

    const { id } = await machine('T01');
    await service.linkMachine({ actorUserId: adminId, machineId: id, equipmentId: 'eq-1' });
    expect((await service.listUnlinkedMachines()).map((listed) => listed.equipmentId)).toEqual(['eq-2']);
  });

  test('serves the equipment list and hours from a five-minute cache until Refresh', async ({ db }) => {
    const { state, service } = await setUp(db);
    await service.listUnlinkedMachines();
    await service.listUnlinkedMachines();
    expect(state.calls).toEqual([
      '/isg/equipment',
      '/platform/machines/2/engineHours',
      '/platform/machines/1/engineHours',
    ]);

    state.now = new Date(state.now.getTime() + 5 * 60 * 1000 + 1);
    await service.listUnlinkedMachines();
    expect(state.calls).toHaveLength(6);

    service.refresh();
    await service.listUnlinkedMachines();
    expect(state.calls).toHaveLength(9);
  });

  test('links a Machine, writes the PIN as its serial number and audits both', async ({ db }) => {
    const { service, machine } = await setUp(db);
    const t01 = await machine('T01');
    await db.insert(contractingHourReadings).values({
      machineId: t01.id,
      role: 'baseline',
      value: 1200.5,
      capturedAt: new Date('2026-10-25T10:00:00.000Z'),
      capturedByUserId: adminId,
      method: 'manual',
      aiVerification: 'not-applicable',
    });

    await service.linkMachine({ actorUserId: adminId, machineId: t01.id, equipmentId: 'eq-1' });

    const [stored] = await db.select().from(contractingMachines).where(eq(contractingMachines.id, t01.id));
    expect(stored?.serialNumber).toBe('PIN-eq-1');
    expect(await service.listLinks()).toEqual([
      expect.objectContaining({
        machine: expect.objectContaining({ code: 'T01', latestReadingHours: 1200.5, retiredAt: null }),
        equipmentId: 'eq-1',
        principalId: 1,
        deereName: 'Deere eq-1',
        serialNumber: 'PIN-eq-1',
        lost: false,
        lastPolledAt: null,
      }),
    ]);
    const events = await db.select().from(auditEvents);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entityType: 'contracting_john_deere_link',
          action: 'created',
          summary: expect.stringContaining('T01'),
        }),
        expect.objectContaining({ entityType: 'contracting_machine', action: 'updated', entityId: t01.id }),
      ]),
    );
  });

  test('refuses a retired, linked or missing Machine, a linked or unlisted Deere machine, and a taken serial', async ({
    db,
  }) => {
    const { service, machine } = await setUp(db);
    const t01 = await machine('T01');
    const t02 = await machine('T02');
    const retired = await machine('T03', { retiredAt: new Date(), retiredReason: 'Sold' });
    await machine('T04', { serialNumber: 'pin-eq-2' });
    const link = (machineId: string, equipmentId: string) =>
      service.linkMachine({ actorUserId: adminId, machineId, equipmentId });

    await link(t01.id, 'eq-1');
    await expect(link(retired.id, 'eq-2')).rejects.toMatchObject({ code: 'john_deere.machine_retired' });
    await expect(link(t01.id, 'eq-2')).rejects.toMatchObject({ code: 'john_deere.machine_linked' });
    await expect(link(t02.id, 'eq-1')).rejects.toMatchObject({ code: 'john_deere.equipment_linked' });
    await expect(link(t02.id, 'eq-9')).rejects.toMatchObject({ code: 'john_deere.equipment_not_found' });
    await expect(link(t02.id, 'eq-2')).rejects.toMatchObject({ code: 'john_deere.serial_taken' });
    await expect(link('00000000-0000-4000-8000-000000000000', 'eq-2')).rejects.toMatchObject({
      code: 'john_deere.machine_not_found',
    });
    expect(await links(db)).toHaveLength(1);
  });

  test('refuses when John Deere is not connected', async ({ db }) => {
    const { service, machine } = await setUp(db);
    const t01 = await machine('T01');
    await db.update(contractingJohnDeereConnection).set({ status: 'needs-reconnect' });
    await expect(service.listUnlinkedMachines()).rejects.toMatchObject({ code: 'john_deere.not_connected' });
    await expect(
      service.linkMachine({ actorUserId: adminId, machineId: t01.id, equipmentId: 'eq-1' }),
    ).rejects.toMatchObject({ code: 'john_deere.not_connected' });
  });

  test('the database holds one active Link per Machine and per Deere machine', async ({ db }) => {
    const { machine } = await setUp(db);
    const t01 = await machine('T01');
    const t02 = await machine('T02');
    const row = (machineId: string, equipmentId: string) => ({
      machineId,
      equipmentId,
      principalId: 1,
      organizationId: '4321',
      deereName: 'Deere',
      linkedByUserId: adminId,
      linkedAt: new Date(),
    });
    await db.insert(contractingJohnDeereLinks).values(row(t01.id, 'eq-1'));
    await expect(db.insert(contractingJohnDeereLinks).values(row(t01.id, 'eq-2'))).rejects.toThrow();
    await expect(db.insert(contractingJohnDeereLinks).values(row(t02.id, 'eq-1'))).rejects.toThrow();
  });

  test('unlinking keeps the row and the serial; re-linking makes a second row', async ({ db }) => {
    const { state, service, machine } = await setUp(db);
    const t01 = await machine('T01');
    await service.linkMachine({ actorUserId: adminId, machineId: t01.id, equipmentId: 'eq-1' });
    const [first] = await service.listLinks();
    if (!first) throw new Error('No link');

    state.now = new Date('2026-10-26T09:00:00.000Z');
    await service.unlinkMachine({ actorUserId: adminId, linkId: first.id });
    expect(await service.listLinks()).toEqual([]);
    await expect(service.unlinkMachine({ actorUserId: adminId, linkId: first.id })).rejects.toMatchObject({
      code: 'john_deere.link_not_found',
    });
    const [stored] = await db.select().from(contractingMachines).where(eq(contractingMachines.id, t01.id));
    expect(stored?.serialNumber).toBe('PIN-eq-1');

    await service.linkMachine({ actorUserId: adminId, machineId: t01.id, equipmentId: 'eq-1' });
    expect((await links(db)).map(({ unlinkedAt, unlinkedByUserId }) => ({ unlinkedAt, unlinkedByUserId }))).toEqual([
      { unlinkedAt: new Date('2026-10-26T09:00:00.000Z'), unlinkedByUserId: adminId },
      { unlinkedAt: null, unlinkedByUserId: null },
    ]);
    expect(
      await db.select().from(auditEvents).where(eq(auditEvents.entityType, 'contracting_john_deere_link')),
    ).toHaveLength(3);
  });
});
