import { auditEvents, customers, type Db, jobBays, jobSlots, products, quotes, sql } from '@pkg/db';
import type { Product } from '@pkg/schema';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-05T09:00:00.000+02:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'admin');
  await seedFabricationBays(db);
  const product = await createProduct(db);
  const quote = await createAcceptedQuote(db, product.id);

  return {
    db,
    product,
    quote,
  };
});

describe('jobs.listBays', () => {
  test('returns fabrication bays for authorized job readers', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    await expect(caller.jobs.listBays()).resolves.toMatchObject({
      items: [
        { department: 'fabrication', name: 'Fabrication Bay 1' },
        { department: 'fabrication', name: 'Fabrication Bay 2' },
        { department: 'fabrication', name: 'Fabrication Bay 3' },
        { department: 'fabrication', name: 'Fabrication Bay 4' },
        { department: 'fabrication', name: 'Fabrication Bay 5' },
      ],
    });
  });

  test('rejects roles without job read permission', async ({ context }) => {
    const caller = context.createCaller(mockSession('sales'));

    await expect(caller.jobs.listBays()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('returns Off-Day facts and reflowed projected slots', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const job = await adminCaller.jobs.create({
      quoteId: context.quote.id,
    });

    await adminCaller.jobs.toggleOffDay({
      date: '2026-06-06',
      isOffDay: true,
      label: 'Shutdown',
    });
    await adminCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 2,
      jobId: job.id,
    });

    await expect(adminCaller.jobs.listBays()).resolves.toMatchObject({
      offDays: [{ date: '2026-06-06', label: 'Shutdown' }],
      items: expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b02',
          nextAvailableAt: '2026-06-07T22:00:00.000Z',
          slots: [
            expect.objectContaining({
              jobCode: job.code,
              startAt: '2026-06-04T22:00:00.000Z',
              endAt: '2026-06-07T22:00:00.000Z',
            }),
          ],
        }),
      ]),
    });
  });
});

describe('jobs bay management', () => {
  test('allows admins to create, rename, disable, and re-enable Bays with audit', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    const created = await caller.jobs.createBay({
      department: 'paint',
      name: '  Paint Bay 1  ',
    });
    expect(created.bay).toMatchObject({
      department: 'paint',
      disabledAt: null,
      name: 'Paint Bay 1',
    });

    await expect(caller.jobs.renameBay({ id: created.bay.id, name: '  Paint Prep Bay  ' })).resolves.toMatchObject({
      bay: {
        department: 'paint',
        id: created.bay.id,
        name: 'Paint Prep Bay',
      },
    });
    await expect(caller.jobs.setBayDisabled({ disabled: true, id: created.bay.id })).resolves.toMatchObject({
      bay: {
        disabledAt: expect.any(String),
        id: created.bay.id,
      },
    });
    await expect(caller.jobs.listJobBays({ filters: { isDisabled: false } })).resolves.toMatchObject({
      items: expect.not.arrayContaining([expect.objectContaining({ id: created.bay.id })]),
    });
    await expect(caller.jobs.listJobBays({ filters: { isDisabled: true } })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ disabledAt: expect.any(String), id: created.bay.id })]),
    });
    await expect(caller.jobs.listJobBays({ filters: {} })).resolves.toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ disabledAt: expect.any(String), id: created.bay.id })]),
    });
    await expect(caller.jobs.setBayDisabled({ disabled: false, id: created.bay.id })).resolves.toMatchObject({
      bay: {
        disabledAt: null,
        id: created.bay.id,
      },
    });

    const events = await context.db.select().from(auditEvents);
    expect(events.filter((event) => event.entityType === 'job_bay')).toHaveLength(4);
  });

  test('rejects non-admin bay management and missing Bays', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));

    await expect(salesCaller.jobs.listJobBays({ filters: {} })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(salesCaller.jobs.createBay({ department: 'paint', name: 'Paint Bay' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      adminCaller.jobs.renameBay({
        id: '00000000-0000-4000-8000-00000000dead',
        name: 'Missing Bay',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('rejects new bookings for disabled Bays while schedule reads still include them', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    const bayId = '00000000-0000-4000-8000-000000000b01';

    await caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id });
    await caller.jobs.setBayDisabled({ disabled: true, id: bayId });

    await expect(caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(caller.jobs.listBays()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          disabledAt: expect.any(String),
          id: bayId,
          slots: [expect.objectContaining({ jobId: job.id })],
        }),
      ]),
    });
  });
});

describe('jobs.toggleOffDay', () => {
  test('allows admins to create and remove Off-Days', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    await expect(
      caller.jobs.toggleOffDay({
        date: '2026-06-16',
        isOffDay: true,
        label: '  Youth Day  ',
      }),
    ).resolves.toEqual({
      offDay: {
        date: '2026-06-16',
        label: 'Youth Day',
      },
    });
    await expect(
      caller.jobs.toggleOffDay({
        date: '2026-06-16',
        isOffDay: false,
        label: null,
      }),
    ).resolves.toEqual({ offDay: null });
  });

  test('rejects non-admin Job users', async ({ context }) => {
    const procurementCaller = context.createCaller(mockSession('procurement-manager'));
    const salesCaller = context.createCaller(mockSession('sales'));

    await expect(
      procurementCaller.jobs.toggleOffDay({
        date: '2026-06-16',
        isOffDay: true,
        label: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      salesCaller.jobs.toggleOffDay({
        date: '2026-06-16',
        isOffDay: true,
        label: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('jobs bay calendar exceptions', () => {
  test('allows authorized schedulers to add and remove Bay exceptions', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    await expect(
      caller.jobs.addBayException({
        bayId: '00000000-0000-4000-8000-000000000b01',
        date: '2026-06-06',
        direction: 'work',
        label: '  Saturday push  ',
      }),
    ).resolves.toEqual({
      exception: {
        bayId: '00000000-0000-4000-8000-000000000b01',
        date: '2026-06-06',
        direction: 'work',
        label: 'Saturday push',
      },
    });
    await expect(
      caller.jobs.removeBayException({
        bayId: '00000000-0000-4000-8000-000000000b01',
        date: '2026-06-06',
      }),
    ).resolves.toEqual({
      exception: {
        bayId: '00000000-0000-4000-8000-000000000b01',
        date: '2026-06-06',
        direction: 'work',
        label: 'Saturday push',
      },
    });
    await expect(
      caller.jobs.removeBayException({
        bayId: '00000000-0000-4000-8000-000000000b01',
        date: '2026-06-06',
      }),
    ).resolves.toEqual({ exception: null });
  });

  test('rejects unauthorized schedulers and missing Bays', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));

    await expect(
      salesCaller.jobs.addBayException({
        bayId: '00000000-0000-4000-8000-000000000b01',
        date: '2026-06-06',
        direction: 'work',
        label: null,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      adminCaller.jobs.addBayException({
        bayId: '00000000-0000-4000-8000-00000000dead',
        date: '2026-06-06',
        direction: 'work',
        label: null,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('listBays returns Bay exception facts and reflowed projections', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const job = await adminCaller.jobs.create({
      quoteId: context.quote.id,
    });

    await adminCaller.jobs.toggleOffDay({
      date: '2026-06-06',
      isOffDay: true,
      label: 'Shutdown',
    });
    await adminCaller.jobs.addBayException({
      bayId: '00000000-0000-4000-8000-000000000b02',
      date: '2026-06-06',
      direction: 'work',
      label: 'Overtime',
    });
    await adminCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 2,
      jobId: job.id,
    });

    await expect(adminCaller.jobs.listBays()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          calendarExceptions: [
            {
              bayId: '00000000-0000-4000-8000-000000000b02',
              date: '2026-06-06',
              direction: 'work',
              label: 'Overtime',
            },
          ],
          id: '00000000-0000-4000-8000-000000000b02',
          nextAvailableAt: '2026-06-06T22:00:00.000Z',
        }),
      ]),
      offDays: [{ date: '2026-06-06', label: 'Shutdown' }],
    });
  });
});

describe('jobs.create', () => {
  test('creates a job without stage rows', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });

    expect(job).toMatchObject({
      productId: context.product.id,
      productSerialNumber: expect.stringMatching(/^JOB-TEST\d{6}$/),
      productSerialPrefix: 'JOB-TEST',
      productSerialSequence: 1,
      quoteId: context.quote.id,
      vinNumber: null,
    });
    expect(job.schedule.map((item) => item.department)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
    expect(job.schedule.every((item) => item.bays.length === 0)).toBe(true);
  });

  test('creates a job with seeded Bay slots in the returned schedule', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    const job = await caller.jobs.create({
      baySeeds: [
        { bayId: '00000000-0000-4000-8000-000000000b01', durationDays: 2 },
        { bayId: '00000000-0000-4000-8000-000000000b02', durationDays: 1 },
      ],
      quoteId: context.quote.id,
    });

    const slots = await context.db
      .select()
      .from(jobSlots)
      .orderBy(sql`${jobSlots.bayId} asc`, sql`${jobSlots.sequence} asc`);
    expect(slots).toMatchObject([
      {
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 2,
        jobId: job.id,
        kind: 'work',
        sequence: 1,
      },
      {
        bayId: '00000000-0000-4000-8000-000000000b02',
        durationDays: 1,
        jobId: job.id,
        kind: 'work',
        sequence: 1,
      },
    ]);
    expect(job.schedule.flatMap((department) => department.bays).flatMap((bay) => bay.slots)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          durationDays: 2,
          jobCode: job.code,
          jobId: job.id,
        }),
        expect.objectContaining({
          durationDays: 1,
          jobCode: job.code,
          jobId: job.id,
        }),
      ]),
    );
  });

  test('rejects invalid and unavailable Bay seeds', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    await expect(
      caller.jobs.create({
        baySeeds: [{ bayId: '00000000-0000-4000-8000-000000000b01', durationDays: 0 }],
        quoteId: context.quote.id,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await context.db
      .update(jobBays)
      .set({ disabledAt: new Date() })
      .where(sql`${jobBays.id} = '00000000-0000-4000-8000-000000000b01'`);
    await expect(
      caller.jobs.create({
        baySeeds: [{ bayId: '00000000-0000-4000-8000-000000000b01', durationDays: 1 }],
        quoteId: context.quote.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller.jobs.create({
        baySeeds: [{ bayId: '00000000-0000-4000-8000-00000000dead', durationDays: 1 }],
        quoteId: context.quote.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('returns the product serial number from get and list, and can search by it', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });

    await expect(caller.jobs.get({ id: job.id })).resolves.toMatchObject({
      id: job.id,
      productSerialNumber: job.productSerialNumber,
      vinNumber: null,
    });

    const result = await caller.jobs.list({
      filters: {},
      page: 1,
      pageSize: 10,
      search: job.productSerialNumber,
      sortBy: 'createdAt',
      sortDirection: 'asc',
    });

    expect(result.items).toEqual([
      expect.objectContaining({
        id: job.id,
        productSerialNumber: job.productSerialNumber,
        vinNumber: null,
      }),
    ]);
  });
});

describe('jobs.bookSlot', () => {
  test('books an authorized Job onto a fabrication bay', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    await expect(
      caller.jobs.bookSlot({
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 1,
        jobId: job.id,
      }),
    ).resolves.toMatchObject({
      slot: {
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 1,
        jobId: job.id,
        sequence: 1,
      },
    });
  });

  test('rejects users without job scheduling permissions', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await adminCaller.jobs.create({
      quoteId: context.quote.id,
    });

    await expect(
      salesCaller.jobs.bookSlot({
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 1,
        jobId: job.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('listBays returns projected slots after booking', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 2,
      jobId: job.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b02',
          nextAvailableAt: '2026-06-06T22:00:00.000Z',
          slots: [
            expect.objectContaining({
              jobCode: job.code,
              startAt: '2026-06-04T22:00:00.000Z',
              endAt: '2026-06-06T22:00:00.000Z',
            }),
          ],
        }),
      ]),
    );
  });

  test('bookSlot auto-inserts a projected idle gap when the bay queue ended in the past', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    await context.db.execute(sql`
      UPDATE "job_bay"
      SET "schedule_origin" = '2026-06-01T00:00:00.000Z'
      WHERE "id" = '00000000-0000-4000-8000-000000000b04'
    `);

    const workSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b04',
      durationDays: 1,
      jobId: job.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b04',
          slots: [
            expect.objectContaining({
              durationDays: 4,
              kind: 'idle',
              label: null,
              sequence: 1,
            }),
            expect.objectContaining({
              id: workSlot.slot.id,
              kind: 'work',
              sequence: 2,
            }),
          ],
        }),
      ]),
    );
  });
});

describe('jobs.resizeSlot', () => {
  test('resizes an authorized slot and returns reflowed projections from listBays', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({
      quoteId: secondQuote.id,
    });
    const firstSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 1,
      jobId: firstJob.id,
    });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 1,
      jobId: secondJob.id,
    });

    await expect(
      caller.jobs.resizeSlot({
        durationDays: 2,
        slotId: firstSlot.slot.id,
      }),
    ).resolves.toMatchObject({
      slot: {
        durationDays: 2,
        id: firstSlot.slot.id,
      },
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b03',
          slots: [
            expect.objectContaining({
              id: firstSlot.slot.id,
              durationDays: 2,
              startAt: '2026-06-04T22:00:00.000Z',
              endAt: '2026-06-06T22:00:00.000Z',
            }),
            expect.objectContaining({
              jobCode: secondJob.code,
              startAt: '2026-06-06T22:00:00.000Z',
              endAt: '2026-06-07T22:00:00.000Z',
            }),
          ],
        }),
      ]),
    );
  });

  test('rejects users without job scheduling permissions', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await adminCaller.jobs.create({
      quoteId: context.quote.id,
    });
    const slot = await adminCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: job.id,
    });

    await expect(
      salesCaller.jobs.resizeSlot({
        durationDays: 2,
        slotId: slot.slot.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.addIdleSlot', () => {
  test('adds an idle slot next to an existing slot and returns it', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const workSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b04',
      durationDays: 1,
      jobId: job.id,
    });

    await expect(
      caller.jobs.addIdleSlot({
        durationDays: 1,
        label: null,
        placement: 'after',
        targetSlotId: workSlot.slot.id,
      }),
    ).resolves.toMatchObject({
      slot: {
        durationDays: 1,
        jobId: null,
        kind: 'idle',
        label: null,
        sequence: 2,
      },
    });
  });

  test('rejects users without job scheduling permissions', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await adminCaller.jobs.create({
      quoteId: context.quote.id,
    });
    const workSlot = await adminCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: job.id,
    });

    await expect(
      salesCaller.jobs.addIdleSlot({
        durationDays: 1,
        placement: 'after',
        targetSlotId: workSlot.slot.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('listBays returns projected idle slots after insertion', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const workSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b05',
      durationDays: 1,
      jobId: job.id,
    });
    const idleSlot = await caller.jobs.addIdleSlot({
      durationDays: 1,
      placement: 'before',
      targetSlotId: workSlot.slot.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b05',
          slots: [
            expect.objectContaining({
              id: idleSlot.slot.id,
              kind: 'idle',
              label: null,
              startAt: '2026-06-04T22:00:00.000Z',
              endAt: '2026-06-05T22:00:00.000Z',
            }),
            expect.objectContaining({
              id: workSlot.slot.id,
              jobCode: job.code,
              kind: 'work',
              startAt: '2026-06-05T22:00:00.000Z',
              endAt: '2026-06-06T22:00:00.000Z',
            }),
          ],
        }),
      ]),
    );
  });
});

describe('jobs.removeSlot', () => {
  test('removes an authorized slot', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const slot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: job.id,
    });

    await expect(
      caller.jobs.removeSlot({
        slotId: slot.slot.id,
      }),
    ).resolves.toMatchObject({
      slot: {
        id: slot.slot.id,
        sequence: 1,
      },
    });
  });

  test('rejects users without job scheduling permissions', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await adminCaller.jobs.create({
      quoteId: context.quote.id,
    });
    const slot = await adminCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: job.id,
    });

    await expect(
      salesCaller.jobs.removeSlot({
        slotId: slot.slot.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('listBays returns reflowed projected slots after removal', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({
      quoteId: secondQuote.id,
    });
    const thirdQuote = await createAcceptedQuote(context.db, context.product.id);
    const thirdJob = await caller.jobs.create({
      quoteId: thirdQuote.id,
    });
    const firstSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 1,
      jobId: firstJob.id,
    });
    const secondSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 1,
      jobId: secondJob.id,
    });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 1,
      jobId: thirdJob.id,
    });
    await caller.jobs.removeSlot({
      slotId: firstSlot.slot.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b02',
          nextAvailableAt: '2026-06-06T22:00:00.000Z',
          slots: [
            expect.objectContaining({
              id: secondSlot.slot.id,
              jobCode: secondJob.code,
              sequence: 1,
              startAt: '2026-06-04T22:00:00.000Z',
              endAt: '2026-06-05T22:00:00.000Z',
            }),
            expect.objectContaining({
              jobCode: thirdJob.code,
              sequence: 2,
              startAt: '2026-06-05T22:00:00.000Z',
              endAt: '2026-06-06T22:00:00.000Z',
            }),
          ],
        }),
      ]),
    );
  });
});

async function createProduct(db: Db): Promise<Pick<Product, 'id'>> {
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'JOB-TEST',
      name: 'Job Test Product',
    })
    .returning({ id: products.id });

  if (!product) {
    throw new Error('Product insert did not return a row');
  }

  return product;
}

async function seedFabricationBays(db: Db): Promise<void> {
  const now = new Date('2026-06-05T00:00:00.000Z');

  await db
    .insert(jobBays)
    .values([
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b01',
        name: 'Fabrication Bay 1',
        scheduleOrigin: now,
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b02',
        name: 'Fabrication Bay 2',
        scheduleOrigin: now,
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b03',
        name: 'Fabrication Bay 3',
        scheduleOrigin: now,
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b04',
        name: 'Fabrication Bay 4',
        scheduleOrigin: now,
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b05',
        name: 'Fabrication Bay 5',
        scheduleOrigin: now,
        updatedAt: now,
      },
    ])
    .onConflictDoUpdate({
      target: jobBays.id,
      set: {
        department: 'fabrication',
        scheduleOrigin: now,
        updatedAt: now,
      },
    });
}

async function createAcceptedQuote(db: Db, productId: Product['id']) {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Job Test Customer',
      email: null,
    })
    .returning({ id: customers.id });
  if (!customer) {
    throw new Error('Customer insert did not return a row');
  }

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      status: 'accepted',
    })
    .returning({ id: quotes.id });

  if (!quote) {
    throw new Error('Quote insert did not return a row');
  }

  return quote;
}
