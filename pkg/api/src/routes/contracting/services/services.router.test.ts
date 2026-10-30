import { captureReading, createCategory, createMachine } from '@pkg/core/contracting';
import { user } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import type { ContractingRole } from '@pkg/schema';
import { MachineCreateInput } from '@pkg/schema/contracting';
import { expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { sessionAs } from '@/test/test-utils.js';

const test = createTester(async ({ db }) => {
  const now = new Date();
  const person = (id: string, contractingRole: ContractingRole) => ({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    contractingRole,
    createdAt: now,
    updatedAt: now,
  });
  await db
    .insert(user)
    .values([
      person('connor', 'workshop-manager'),
      person('sipho', 'foreman'),
      person('cara', 'contracting-manager'),
      person('mo', 'mechanic'),
    ]);
  const category = await createCategory({ db, actorUserId: 'connor', input: { name: 'Tractors', kind: 'machine' } });
  /** A Machine with a Next Service Due and, when given, a spot reading that many hours short of it. */
  const machineWith = async (code: string, nextServiceDueHours: number | null, latestReadingHours?: number) => {
    const created = await createMachine({
      db,
      actorUserId: 'connor',
      input: MachineCreateInput.parse({
        code,
        make: 'Deere',
        model: '6140M',
        categoryId: category.id,
        nextServiceDueHours,
      }),
    });
    if (latestReadingHours !== undefined)
      await captureReading({
        db,
        actor: accessForRole('contracting-manager', 'cara'),
        input: {
          machineId: created.id,
          role: 'spot',
          value: latestReadingHours,
          capturedAt: '2026-10-20T08:00:00Z',
          disputePrevious: false,
        },
      });
    return created;
  };
  const machine = await machineWith('JD6140M-2', null);
  return { db, machine, machineWith };
});

test('the workshop manager closes a service with the sticker; a below-reading due is a bad request', async ({
  context,
}) => {
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager'));
  const opened = await connor.contractingServices.open({
    machineId: context.machine.id,
    startDate: '2026-10-01',
    notes: null,
  });
  await expect(
    connor.contractingServices.close({
      id: opened.id,
      endDate: '2026-10-01',
      readingAtServiceHours: 1450,
      primaryMechanicUserId: null,
      notes: null,
      nextServiceDueHours: 1400,
    }),
  ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  await connor.contractingServices.close({
    id: opened.id,
    endDate: '2026-10-01',
    readingAtServiceHours: 1450,
    primaryMechanicUserId: null,
    notes: null,
    nextServiceDueHours: 1700,
  });
  expect(await connor.contractingFleet.machines.get({ id: context.machine.id })).toMatchObject({
    nextServiceDueHours: 1700,
  });
  await expect(connor.contractingServices.patch({ id: opened.id, notes: 'Late note' })).rejects.toMatchObject({
    code: 'CONFLICT',
  });
});

test('a Foreman cannot record a service', async ({ context }) => {
  const sipho = context.createCaller(sessionAs('sipho', 'foreman'));
  await expect(
    sipho.contractingServices.open({ machineId: context.machine.id, startDate: '2026-10-01', notes: null }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test('booking a Machine in serves it as Booked In until its Service Record closes', async ({ context }) => {
  const { machineWith } = context;
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager'));
  const booked = await machineWith('JD-BOOKED', 1400, 1449);
  const bookedIn = await connor.contractingServices.open({
    machineId: booked.id,
    startDate: '2026-10-21',
    notes: null,
  });

  expect(await connor.contractingFleet.machines.get({ id: booked.id })).toMatchObject({
    serviceDueStatus: 'overdue',
    bookedInServiceId: bookedIn.id,
  });

  await connor.contractingServices.close({
    id: bookedIn.id,
    endDate: '2026-10-22',
    readingAtServiceHours: 1449,
    primaryMechanicUserId: null,
    notes: null,
    nextServiceDueHours: 1949,
  });
  expect(await connor.contractingFleet.machines.get({ id: booked.id })).toMatchObject({
    serviceDueStatus: 'ok',
    bookedInServiceId: null,
  });
});

test('the Services table lists every Service Record Booked In first, then newest, and filters them', async ({
  context,
}) => {
  const { machineWith } = context;
  const connor = context.createCaller(sessionAs('connor', 'workshop-manager'));
  const [early, late, open] = await Promise.all([
    machineWith('EXC-EARLY', null),
    machineWith('EXC-LATE', null),
    machineWith('TLB-OPEN', null),
  ]);
  const record = (machineId: string, startDate: string, primaryMechanicUserId: string | null = null) =>
    connor.contractingServices.open({ machineId, startDate, primaryMechanicUserId, notes: null });
  const close = (id: string, endDate: string, primaryMechanicUserId: string | null = null) =>
    connor.contractingServices.close({
      id,
      endDate,
      readingAtServiceHours: 100,
      primaryMechanicUserId,
      notes: null,
      nextServiceDueHours: 600,
    });
  await close((await record(early.id, '2026-09-01')).id, '2026-09-02');
  await close((await record(late.id, '2026-10-01', 'mo')).id, '2026-10-02', 'mo');
  await record(open.id, '2026-08-01');
  const codes = async (input: Parameters<typeof connor.contractingServices.list>[0]) =>
    (await connor.contractingServices.list(input)).items.map((item) => item.machineCode);

  const all = await connor.contractingServices.list({});
  expect(all.items.map((item) => [item.machineCode, item.status])).toEqual([
    ['TLB-OPEN', 'open'],
    ['EXC-LATE', 'closed'],
    ['EXC-EARLY', 'closed'],
  ]);
  expect(all.total).toBe(3);
  expect(all.items[0]).toMatchObject({ categoryName: 'Tractors' });
  expect(await codes({ statuses: ['closed'] })).toEqual(['EXC-LATE', 'EXC-EARLY']);
  expect(await codes({ search: 'exc-e' })).toEqual(['EXC-EARLY']);
  expect(await codes({ mechanicUserIds: ['mo'] })).toEqual(['EXC-LATE']);
  expect(await codes({ machineIds: [open.id] })).toEqual(['TLB-OPEN']);
  expect(await connor.contractingServices.options.filters()).toEqual({
    machines: [
      { id: early.id, code: 'EXC-EARLY' },
      { id: late.id, code: 'EXC-LATE' },
      { id: open.id, code: 'TLB-OPEN' },
    ],
    mechanics: [{ id: 'mo', name: 'mo' }],
  });
});

test('a Foreman reads none of the Services page', async ({ context }) => {
  const sipho = context.createCaller(sessionAs('sipho', 'foreman'));
  await expect(sipho.contractingServices.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(sipho.contractingServices.options.filters()).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

test("a Machine's Service Alert Hours judge it instead of Settings, and clearing them falls back", async ({
  context,
}) => {
  const { machineWith } = context;
  const cara = context.createCaller(sessionAs('cara', 'contracting-manager'));
  const machine = await machineWith('JD-ALERT', 1500, 1440);
  const read = () => cara.contractingFleet.machines.get({ id: machine.id });
  expect(await read()).toMatchObject({ serviceDueStatus: 'due-soon', effectiveServiceAlertHours: 100 });

  await cara.contractingFleet.machines.patch({ id: machine.id, serviceAlertHours: 50 });
  expect(await read()).toMatchObject({ serviceAlertHours: 50, serviceDueStatus: 'ok', effectiveServiceAlertHours: 50 });

  await cara.contractingFleet.machines.patch({ id: machine.id, serviceAlertHours: null });
  expect(await read()).toMatchObject({ serviceAlertHours: null, serviceDueStatus: 'due-soon' });
});
