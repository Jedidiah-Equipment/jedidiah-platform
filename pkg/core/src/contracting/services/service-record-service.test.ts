import { auditEvents, user } from '@pkg/db';
import { DateOnlyIso } from '@pkg/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { getMachine, listMachines, patchMachine, retireMachine } from '../fleet/machine-service.js';
import { captureReading } from '../readings/reading-service.js';
import { admin, adminId, seedJobFixtures } from '../test/job-fixtures.js';
import {
  closeServiceRecord,
  listServiceRecords,
  openServiceRecord,
  patchServiceRecord,
} from './service-record-service.js';

const test = createTester(async ({ db }) => {
  const fixtures = await seedJobFixtures(db);
  const now = new Date();
  await db.insert(user).values([
    {
      id: 'danie',
      name: 'Danie',
      email: 'danie@example.com',
      emailVerified: true,
      contractingRole: 'mechanic',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'bay-tablet',
      name: 'Bay tablet',
      email: 'bay-tablet@example.com',
      emailVerified: true,
      contractingRole: 'mechanic',
      isDevice: true,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  return fixtures;
});

const day = (value: string) => DateOnlyIso.parse(value);
const spotReading = (db: Parameters<typeof captureReading>[0]['db'], machineId: string, value: number) =>
  captureReading({
    db,
    actor: admin,
    input: { machineId, role: 'spot', value, capturedAt: '2026-09-07T08:00:00Z', disputePrevious: false },
  });

describe('Service Due Soon', () => {
  test('a spot reading moves a Machine to due soon', async ({ context: { db, excavator } }) => {
    await patchMachine({ db, actorUserId: adminId, input: { id: excavator.id, nextServiceDueHours: 1500 } });
    expect((await getMachine({ db, id: excavator.id })).serviceDueStatus).toBe('unknown');

    await spotReading(db, excavator.id, 1300);
    expect((await getMachine({ db, id: excavator.id })).serviceDueStatus).toBe('ok');

    await spotReading(db, excavator.id, 1449);
    const listed = (await listMachines({ db, input: { status: 'active', search: '' } })).find(
      (machine) => machine.id === excavator.id,
    );
    expect(listed).toMatchObject({ latestReadingHours: 1449, hoursToService: 51, serviceDueStatus: 'due-soon' });
  });
});

describe('Service Records', () => {
  test('closing stamps Next Service Due on the Machine and audits both', async ({ context: { db, excavator } }) => {
    const opened = await openServiceRecord({
      db,
      actorUserId: adminId,
      input: { machineId: excavator.id, startDate: day('2026-10-01'), primaryMechanicUserId: 'danie', notes: null },
    });
    expect(opened).toMatchObject({ status: 'open', mechanicName: 'Danie', machineCode: 'CAT320-1' });

    const closed = await closeServiceRecord({
      db,
      actorUserId: adminId,
      input: {
        id: opened.id,
        endDate: day('2026-10-02'),
        readingAtServiceHours: 1450,
        primaryMechanicUserId: 'danie',
        notes: '500 h service',
        nextServiceDueHours: 1700,
      },
    });
    expect(closed).toMatchObject({ status: 'closed', nextServiceDueHoursSet: 1700, closedByName: 'Jed' });
    expect((await getMachine({ db, id: excavator.id })).nextServiceDueHours).toBe(1700);
    expect(await listServiceRecords({ db, machineId: excavator.id })).toHaveLength(1);

    const events = await db
      .select({ entityType: auditEvents.entityType, action: auditEvents.action, summary: auditEvents.summary })
      .from(auditEvents)
      .where(
        and(
          inArray(auditEvents.entityId, [opened.id, excavator.id]),
          inArray(auditEvents.entityType, ['contracting_service_record', 'contracting_machine']),
        ),
      );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'contracting_service_record', action: 'created' }),
        expect.objectContaining({ entityType: 'contracting_service_record', action: 'updated' }),
        expect.objectContaining({
          entityType: 'contracting_machine',
          action: 'updated',
          summary: 'Next Service Due set by Service Record',
        }),
      ]),
    );

    await expect(
      closeServiceRecord({
        db,
        actorUserId: adminId,
        input: {
          id: opened.id,
          endDate: day('2026-10-03'),
          readingAtServiceHours: 1450,
          primaryMechanicUserId: null,
          notes: null,
          nextServiceDueHours: 1800,
        },
      }),
    ).rejects.toMatchObject({ code: 'service.closed' });
  });

  test('refuses a Next Service Due below the reading and leaves the Machine alone', async ({
    context: { db, excavator },
  }) => {
    const opened = await openServiceRecord({
      db,
      actorUserId: adminId,
      input: { machineId: excavator.id, startDate: day('2026-10-01'), notes: null },
    });
    await expect(
      closeServiceRecord({
        db,
        actorUserId: adminId,
        input: {
          id: opened.id,
          endDate: day('2026-10-01'),
          readingAtServiceHours: 1450,
          primaryMechanicUserId: null,
          notes: null,
          nextServiceDueHours: 1400,
        },
      }),
    ).rejects.toMatchObject({ code: 'service.invalid_close' });
    expect((await getMachine({ db, id: excavator.id })).nextServiceDueHours).toBeNull();
  });

  test('refuses a Mechanic who is a device account', async ({ context: { db, excavator } }) => {
    await expect(
      openServiceRecord({
        db,
        actorUserId: adminId,
        input: {
          machineId: excavator.id,
          startDate: day('2026-10-01'),
          primaryMechanicUserId: 'bay-tablet',
          notes: null,
        },
      }),
    ).rejects.toMatchObject({ code: 'service.invalid_mechanic' });
    const audited = await db.select().from(auditEvents).where(eq(auditEvents.entityType, 'contracting_service_record'));
    expect(audited).toHaveLength(0);
  });

  test('keeps a Mechanic already on the record after their role changes', async ({ context: { db, excavator } }) => {
    const opened = await openServiceRecord({
      db,
      actorUserId: adminId,
      input: { machineId: excavator.id, startDate: day('2026-10-01'), primaryMechanicUserId: 'danie', notes: null },
    });
    await db.update(user).set({ contractingRole: 'driver' }).where(eq(user.id, 'danie'));
    const patched = await patchServiceRecord({
      db,
      actorUserId: adminId,
      input: { id: opened.id, primaryMechanicUserId: 'danie', notes: 'Waiting on a filter' },
    });
    expect(patched.notes).toBe('Waiting on a filter');
  });

  test('a Machine in for a service cannot be retired until the service is closed', async ({
    context: { db, excavator },
  }) => {
    await openServiceRecord({
      db,
      actorUserId: adminId,
      input: { machineId: excavator.id, startDate: day('2026-10-01'), notes: null },
    });
    await expect(
      retireMachine({ db, actorUserId: adminId, input: { id: excavator.id, reason: 'Sold' } }),
    ).rejects.toMatchObject({ code: 'fleet.in_use' });
  });
});
