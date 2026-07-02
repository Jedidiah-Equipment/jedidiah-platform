import {
  auditEvents,
  customers,
  type Db,
  jobBayOperatorAssignments,
  jobBays,
  jobSlots,
  jobs,
  products,
  quotes,
  sql,
  user,
} from '@pkg/db';
import { toPlantDateOnly } from '@pkg/domain';
import { type BoardListResult, type BoardPreviewResult, type Product, ProjectedBayQueue } from '@pkg/schema';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

import { createActorUser } from '@/test/ai-tools.js';
import { createTester } from '@/test/create-tester.js';
import { createProductRangeFixture } from '@/test/product-range-fixtures.js';
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

  test('returns current operators on schedule-backing reads for job readers', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const jobViewerCaller = context.createCaller(mockSession('job-viewer'));
    await createUser(context.db, {
      email: 'schedule.operator@example.com',
      id: 'schedule-operator-user-id',
      name: 'Schedule Operator',
      role: 'bay-operator',
    });
    const job = await adminCaller.jobs.create({ quoteId: context.quote.id });

    await adminCaller.jobs.assignBayOperator({
      bayId: '00000000-0000-4000-8000-000000000b01',
      operatorUserId: 'schedule-operator-user-id',
    });
    await adminCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: job.id,
    });

    await expect(jobViewerCaller.jobs.listBays()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({
            email: 'schedule.operator@example.com',
            id: 'schedule-operator-user-id',
            name: 'Schedule Operator',
            thumbnailDataUrl: null,
          }),
          id: '00000000-0000-4000-8000-000000000b01',
        }),
        expect.objectContaining({
          currentOperator: null,
          id: '00000000-0000-4000-8000-000000000b03',
        }),
      ]),
    });
    await expect(jobViewerCaller.jobs.listJobBays({ filters: {} })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({
            id: 'schedule-operator-user-id',
            name: 'Schedule Operator',
          }),
          id: '00000000-0000-4000-8000-000000000b01',
        }),
        expect.objectContaining({
          currentOperator: null,
          id: '00000000-0000-4000-8000-000000000b03',
        }),
      ]),
    });
    await expect(jobViewerCaller.jobs.get({ id: job.id })).resolves.toMatchObject({
      schedule: expect.arrayContaining([
        expect.objectContaining({
          bays: expect.arrayContaining([
            expect.objectContaining({
              currentOperator: expect.objectContaining({
                id: 'schedule-operator-user-id',
                name: 'Schedule Operator',
              }),
              id: '00000000-0000-4000-8000-000000000b01',
              slots: [expect.objectContaining({ jobId: job.id })],
            }),
          ]),
          department: 'fabrication',
        }),
      ]),
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
      // Plant today: the mocked clock is 09:00 SAST on 2026-06-05.
      today: '2026-06-05',
      items: expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b02',
          nextAvailableDate: '2026-06-08',
          scheduleOrigin: '2026-06-05',
          slots: [
            expect.objectContaining({
              jobCode: job.code,
              startDate: '2026-06-05',
              endDate: '2026-06-08',
            }),
          ],
        }),
      ]),
    });
  });

  test('excludes fully-complete Jobs by default while keeping Bay availability', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    const bayId = '00000000-0000-4000-8000-000000000b01';

    await setBayScheduleOrigin(context.db, bayId, '2026-06-01');
    await seedWorkSlot(context.db, { bayId, durationDays: 4, jobId: job.id, sequence: 1 });

    const schedule = await caller.jobs.listBays();
    const bay = getBoardBay(schedule, bayId);

    expect(bay).toMatchObject({
      nextAvailableDate: '2026-06-05',
      slots: [],
    });
    expect(schedule.jobs.map((summary) => summary.id)).not.toContain(job.id);
  });

  test('returns a partly-done Job whole when a later Bay is unfinished', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    const doneBayId = '00000000-0000-4000-8000-000000000b01';
    const activeBayId = '00000000-0000-4000-8000-000000000b02';

    await setBayScheduleOrigin(context.db, doneBayId, '2026-06-01');
    await setBayScheduleOrigin(context.db, activeBayId, '2026-06-04');
    await seedWorkSlot(context.db, { bayId: doneBayId, durationDays: 2, jobId: job.id, sequence: 1 });
    await seedWorkSlot(context.db, { bayId: activeBayId, durationDays: 4, jobId: job.id, sequence: 1 });

    const schedule = await caller.jobs.listBays();

    expect(getBoardBay(schedule, doneBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-03',
        jobId: job.id,
        startDate: '2026-06-01',
      }),
    ]);
    expect(getBoardBay(schedule, activeBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-08',
        jobId: job.id,
        startDate: '2026-06-04',
      }),
    ]);
    expect(schedule.jobs.map((summary) => summary.id)).toEqual([job.id]);
  });

  test('returns projected slot state and cross-bay jobUnfinished flags', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const crossBayJob = await caller.jobs.create({ quoteId: context.quote.id });
    const activeQuote = await createAcceptedQuote(context.db, context.product.id);
    const activeJob = await caller.jobs.create({ quoteId: activeQuote.id });
    const completeQuote = await createAcceptedQuote(context.db, context.product.id);
    const completeJob = await caller.jobs.create({ quoteId: completeQuote.id });
    const doneBayId = '00000000-0000-4000-8000-000000000b01';
    const activeBayId = '00000000-0000-4000-8000-000000000b02';
    const futureBayId = '00000000-0000-4000-8000-000000000b03';
    const completeBayId = '00000000-0000-4000-8000-000000000b04';

    await setBayScheduleOrigin(context.db, doneBayId, '2026-06-01');
    await setBayScheduleOrigin(context.db, activeBayId, '2026-06-04');
    await setBayScheduleOrigin(context.db, futureBayId, '2026-06-06');
    await setBayScheduleOrigin(context.db, completeBayId, '2026-06-02');
    await seedWorkSlot(context.db, { bayId: doneBayId, durationDays: 1, jobId: crossBayJob.id, sequence: 1 });
    await seedWorkSlot(context.db, { bayId: activeBayId, durationDays: 3, jobId: activeJob.id, sequence: 1 });
    await seedWorkSlot(context.db, { bayId: futureBayId, durationDays: 1, jobId: crossBayJob.id, sequence: 1 });
    await seedWorkSlot(context.db, { bayId: completeBayId, durationDays: 1, jobId: completeJob.id, sequence: 1 });

    const schedule = await caller.jobs.listBays({ from: '2026-06-01' });

    expect(getBoardBay(schedule, doneBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-02',
        jobId: crossBayJob.id,
        jobUnfinished: true,
        startDate: '2026-06-01',
        state: 'done',
      }),
    ]);
    expect(getBoardBay(schedule, activeBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-07',
        jobId: activeJob.id,
        jobUnfinished: true,
        startDate: '2026-06-04',
        state: 'active',
      }),
    ]);
    expect(getBoardBay(schedule, futureBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-07',
        jobId: crossBayJob.id,
        jobUnfinished: true,
        startDate: '2026-06-06',
        state: 'scheduled',
      }),
    ]);
    expect(getBoardBay(schedule, completeBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-03',
        jobId: completeJob.id,
        jobUnfinished: false,
        startDate: '2026-06-02',
        state: 'done',
      }),
    ]);
  });

  test('widens the window with from and limits summaries to returned Jobs', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const historicalJob = await caller.jobs.create({ quoteId: context.quote.id });
    const hiddenQuote = await createAcceptedQuote(context.db, context.product.id);
    const hiddenJob = await caller.jobs.create({ quoteId: hiddenQuote.id });
    const historicalBayId = '00000000-0000-4000-8000-000000000b03';
    const hiddenBayId = '00000000-0000-4000-8000-000000000b04';

    await setBayScheduleOrigin(context.db, historicalBayId, '2026-06-01');
    await setBayScheduleOrigin(context.db, hiddenBayId, '2026-06-01');
    await seedWorkSlot(context.db, { bayId: historicalBayId, durationDays: 3, jobId: historicalJob.id, sequence: 1 });
    await seedWorkSlot(context.db, { bayId: hiddenBayId, durationDays: 2, jobId: hiddenJob.id, sequence: 1 });

    expect(getBoardBay(await caller.jobs.listBays(), historicalBayId).slots).toEqual([]);

    const widened = await caller.jobs.listBays({ from: '2026-06-04' });

    expect(getBoardBay(widened, historicalBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-04',
        jobId: historicalJob.id,
        startDate: '2026-06-01',
      }),
    ]);
    expect(getBoardBay(widened, hiddenBayId).slots).toEqual([]);
    expect(widened.jobs.map((summary) => summary.id)).toEqual([historicalJob.id]);
  });

  test('clamps from to the twelve-month history bound', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const insideJob = await caller.jobs.create({ quoteId: context.quote.id });
    const outsideQuote = await createAcceptedQuote(context.db, context.product.id);
    const outsideJob = await caller.jobs.create({ quoteId: outsideQuote.id });
    const insideBayId = '00000000-0000-4000-8000-000000000b04';
    const outsideBayId = '00000000-0000-4000-8000-000000000b05';

    await setBayScheduleOrigin(context.db, insideBayId, '2025-06-01');
    await setBayScheduleOrigin(context.db, outsideBayId, '2025-06-01');
    await seedWorkSlot(context.db, { bayId: insideBayId, durationDays: 4, jobId: insideJob.id, sequence: 1 });
    await seedWorkSlot(context.db, { bayId: outsideBayId, durationDays: 3, jobId: outsideJob.id, sequence: 1 });

    const schedule = await caller.jobs.listBays({ from: '2024-01-01' });

    expect(getBoardBay(schedule, insideBayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2025-06-05',
        jobId: insideJob.id,
        startDate: '2025-06-01',
      }),
    ]);
    expect(getBoardBay(schedule, outsideBayId).slots).toEqual([]);
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

  test('rejects new bookings for disabled Bays while Board reads still include them', async ({ context }) => {
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

  test('assigns, lists, and unassigns Bay Operators with audit and interval history', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));
    await createUser(context.db, {
      email: 'operator@example.com',
      id: 'operator-user-id',
      name: 'Operator User',
      role: 'bay-operator',
    });
    await createUser(context.db, {
      email: 'other@example.com',
      id: 'other-user-id',
      name: 'Other User',
      role: 'sales',
    });

    await expect(adminCaller.jobs.listBayOperators()).resolves.toEqual({
      operators: [
        {
          email: 'operator@example.com',
          id: 'operator-user-id',
          name: 'Operator User',
          thumbnailDataUrl: null,
        },
      ],
    });
    await expect(
      salesCaller.jobs.assignBayOperator({
        bayId: '00000000-0000-4000-8000-000000000b01',
        operatorUserId: 'operator-user-id',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      adminCaller.jobs.assignBayOperator({
        bayId: '00000000-0000-4000-8000-000000000b01',
        operatorUserId: 'other-user-id',
      }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Only Bay Operator users can be assigned to Bays.',
    });
    await expect(
      adminCaller.jobs.assignBayOperator({
        bayId: '00000000-0000-4000-8000-000000000b01',
        operatorUserId: 'operator-user-id',
      }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: {
          id: 'operator-user-id',
          name: 'Operator User',
        },
        id: '00000000-0000-4000-8000-000000000b01',
      },
    });
    await expect(
      adminCaller.jobs.assignBayOperator({
        bayId: '00000000-0000-4000-8000-000000000b02',
        operatorUserId: 'operator-user-id',
      }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: {
          id: 'operator-user-id',
        },
        id: '00000000-0000-4000-8000-000000000b02',
      },
    });
    await expect(
      adminCaller.jobs.assignBayOperator({
        bayId: '00000000-0000-4000-8000-000000000b01',
        operatorUserId: 'operator-user-id',
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'Bay already has a current operator.',
    });
    await expect(adminCaller.jobs.listJobBays({ filters: {} })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({ id: 'operator-user-id' }),
          id: '00000000-0000-4000-8000-000000000b01',
        }),
      ]),
    });
    await expect(adminCaller.jobs.listBays()).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({ id: 'operator-user-id' }),
          id: '00000000-0000-4000-8000-000000000b01',
        }),
      ]),
    });

    await expect(
      adminCaller.jobs.unassignBayOperator({ bayId: '00000000-0000-4000-8000-000000000b01' }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: null,
        id: '00000000-0000-4000-8000-000000000b01',
      },
    });
    const [closedAssignment] = await context.db
      .select()
      .from(jobBayOperatorAssignments)
      .where(sql`${jobBayOperatorAssignments.bayId} = '00000000-0000-4000-8000-000000000b01'`);
    const events = await context.db.select().from(auditEvents).where(sql`${auditEvents.entityType} = 'job_bay'`);

    expect(closedAssignment?.unassignedAt).toBeInstanceOf(Date);
    expect(events.filter((event) => event.entityId === '00000000-0000-4000-8000-000000000b01')).toHaveLength(2);
  });

  test('returns Bay Operator assignment history newest first', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    await createUser(context.db, {
      email: 'first.operator@example.com',
      id: 'first-history-operator-user-id',
      name: 'First History Operator',
      role: 'bay-operator',
    });
    await createUser(context.db, {
      email: 'second.operator@example.com',
      id: 'second-history-operator-user-id',
      name: 'Second History Operator',
      role: 'bay-operator',
    });

    vi.setSystemTime(new Date('2026-06-05T07:00:00.000Z'));
    await adminCaller.jobs.assignBayOperator({
      bayId: '00000000-0000-4000-8000-000000000b01',
      operatorUserId: 'first-history-operator-user-id',
    });
    vi.setSystemTime(new Date('2026-06-05T08:00:00.000Z'));
    await adminCaller.jobs.unassignBayOperator({ bayId: '00000000-0000-4000-8000-000000000b01' });
    vi.setSystemTime(new Date('2026-06-05T09:00:00.000Z'));
    await adminCaller.jobs.assignBayOperator({
      bayId: '00000000-0000-4000-8000-000000000b01',
      operatorUserId: 'second-history-operator-user-id',
    });
    await adminCaller.jobs.assignBayOperator({
      bayId: '00000000-0000-4000-8000-000000000b02',
      operatorUserId: 'first-history-operator-user-id',
    });

    await expect(
      adminCaller.jobs.listBayOperatorAssignmentHistory({
        bayId: '00000000-0000-4000-8000-000000000b01',
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          assignedAt: '2026-06-05T09:00:00.000Z',
          operator: {
            email: 'second.operator@example.com',
            id: 'second-history-operator-user-id',
            name: 'Second History Operator',
            thumbnailDataUrl: null,
          },
          unassignedAt: null,
        }),
        expect.objectContaining({
          assignedAt: '2026-06-05T07:00:00.000Z',
          operator: {
            email: 'first.operator@example.com',
            id: 'first-history-operator-user-id',
            name: 'First History Operator',
            thumbnailDataUrl: null,
          },
          unassignedAt: '2026-06-05T08:00:00.000Z',
        }),
      ],
    });
  });

  test('rejects Bay Operator assignment history without Bay config read permission', async ({ context }) => {
    const jobViewerCaller = context.createCaller(mockSession('job-viewer'));

    await expect(
      jobViewerCaller.jobs.listBayOperatorAssignmentHistory({
        bayId: '00000000-0000-4000-8000-000000000b01',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('rejects Bay Operator assignment history reads for missing Bays', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));

    await expect(
      adminCaller.jobs.listBayOperatorAssignmentHistory({
        bayId: '00000000-0000-4000-8000-00000000dead',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  test('rejects assigning Bay Operators to disabled Bays', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    await createUser(context.db, {
      email: 'disabled-operator@example.com',
      id: 'disabled-operator-user-id',
      name: 'Disabled Bay Operator',
      role: 'bay-operator',
    });

    await adminCaller.jobs.setBayDisabled({
      disabled: true,
      id: '00000000-0000-4000-8000-000000000b03',
    });

    await expect(
      adminCaller.jobs.assignBayOperator({
        bayId: '00000000-0000-4000-8000-000000000b03',
        operatorUserId: 'disabled-operator-user-id',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'This Bay is disabled and cannot accept new operator assignments.',
    });
  });

  test('preserves and unassigns operator assignments on disabled Bays', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    await createUser(context.db, {
      email: 'roundtrip-operator@example.com',
      id: 'roundtrip-operator-user-id',
      name: 'Round Trip Operator',
      role: 'bay-operator',
    });

    await adminCaller.jobs.assignBayOperator({
      bayId: '00000000-0000-4000-8000-000000000b04',
      operatorUserId: 'roundtrip-operator-user-id',
    });

    await expect(
      adminCaller.jobs.setBayDisabled({
        disabled: true,
        id: '00000000-0000-4000-8000-000000000b04',
      }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: expect.objectContaining({ id: 'roundtrip-operator-user-id' }),
        disabledAt: expect.any(String),
        id: '00000000-0000-4000-8000-000000000b04',
      },
    });
    await expect(adminCaller.jobs.listJobBays({ filters: {} })).resolves.toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({
          currentOperator: expect.objectContaining({ id: 'roundtrip-operator-user-id' }),
          disabledAt: expect.any(String),
          id: '00000000-0000-4000-8000-000000000b04',
        }),
      ]),
    });
    await expect(
      adminCaller.jobs.setBayDisabled({
        disabled: false,
        id: '00000000-0000-4000-8000-000000000b04',
      }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: expect.objectContaining({ id: 'roundtrip-operator-user-id' }),
        disabledAt: null,
        id: '00000000-0000-4000-8000-000000000b04',
      },
    });
    await adminCaller.jobs.setBayDisabled({
      disabled: true,
      id: '00000000-0000-4000-8000-000000000b04',
    });
    await expect(
      adminCaller.jobs.unassignBayOperator({ bayId: '00000000-0000-4000-8000-000000000b04' }),
    ).resolves.toMatchObject({
      bay: {
        currentOperator: null,
        disabledAt: expect.any(String),
        id: '00000000-0000-4000-8000-000000000b04',
      },
    });

    const [closedAssignment] = await context.db
      .select()
      .from(jobBayOperatorAssignments)
      .where(sql`${jobBayOperatorAssignments.bayId} = '00000000-0000-4000-8000-000000000b04'`);

    expect(closedAssignment?.unassignedAt).toBeInstanceOf(Date);
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
          nextAvailableDate: '2026-06-07',
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

  test('seeds Bays at picked start dates with splits, boundary inserts, and appends in one create', async ({
    context,
  }) => {
    const caller = context.createCaller(mockSession('admin'));
    const existingJob = await caller.jobs.create({ quoteId: context.quote.id });
    // b01: one 10-day slot a dated seed will split; b02: two slots whose boundary a
    // dated seed lands on; b03: one slot whose next available day a dated seed picks.
    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 10,
      jobId: existingJob.id,
    });
    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 2,
      jobId: existingJob.id,
    });
    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 3,
      jobId: existingJob.id,
    });
    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 3,
      jobId: existingJob.id,
    });

    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const seededJob = await caller.jobs.create({
      baySeeds: [
        { bayId: '00000000-0000-4000-8000-000000000b01', durationDays: 5, startDate: '2026-06-09' },
        { bayId: '00000000-0000-4000-8000-000000000b02', durationDays: 2, startDate: '2026-06-07' },
        { bayId: '00000000-0000-4000-8000-000000000b03', durationDays: 1, startDate: '2026-06-08' },
      ],
      quoteId: secondQuote.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b01',
          slots: [
            expect.objectContaining({ durationDays: 4, jobId: existingJob.id, sequence: 1 }),
            expect.objectContaining({ durationDays: 5, jobId: seededJob.id, sequence: 2, startDate: '2026-06-09' }),
            expect.objectContaining({ durationDays: 6, jobId: existingJob.id, sequence: 3 }),
          ],
        }),
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b02',
          slots: [
            expect.objectContaining({ durationDays: 2, jobId: existingJob.id, sequence: 1 }),
            expect.objectContaining({ durationDays: 2, jobId: seededJob.id, sequence: 2, startDate: '2026-06-07' }),
            expect.objectContaining({ durationDays: 3, jobId: existingJob.id, sequence: 3 }),
          ],
        }),
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b03',
          slots: [
            expect.objectContaining({ durationDays: 3, jobId: existingJob.id, sequence: 1 }),
            expect.objectContaining({ durationDays: 1, jobId: seededJob.id, sequence: 2, startDate: '2026-06-08' }),
          ],
        }),
      ]),
    );
  });

  test('clamps a seed start date past the queue end to a plain append without fabricating idle', async ({
    context,
  }) => {
    const caller = context.createCaller(mockSession('admin'));

    const job = await caller.jobs.create({
      baySeeds: [{ bayId: '00000000-0000-4000-8000-000000000b03', durationDays: 2, startDate: '2026-06-20' }],
      quoteId: context.quote.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b03',
          slots: [
            expect.objectContaining({
              jobId: job.id,
              kind: 'work',
              sequence: 1,
              startDate: '2026-06-05',
            }),
          ],
        }),
      ]),
    );
  });

  test('creates nothing when any seed in the batch fails', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));

    await expect(
      caller.jobs.create({
        baySeeds: [
          { bayId: '00000000-0000-4000-8000-000000000b01', durationDays: 2, startDate: '2026-06-06' },
          { bayId: '00000000-0000-4000-8000-00000000dead', durationDays: 1 },
        ],
        quoteId: context.quote.id,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(context.db.select().from(jobs)).resolves.toEqual([]);
    await expect(context.db.select().from(jobSlots)).resolves.toEqual([]);
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

describe('jobs.list scheduleState', () => {
  const doneBayId = '00000000-0000-4000-8000-000000000b01';
  const activeBayId = '00000000-0000-4000-8000-000000000b02';
  const scheduledBayId = '00000000-0000-4000-8000-000000000b03';

  test('returns scheduleState null when the caller does not opt in', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    await caller.jobs.bookSlot({ bayId: doneBayId, durationDays: 2, jobId: job.id });

    const result = await caller.jobs.list({ filters: {} });

    expect(result.items.find((item) => item.id === job.id)?.scheduleState).toBeNull();
  });

  test("buckets a Job's Work Slots across bays into done/active/scheduled", async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    const fillerQuote = await createAcceptedQuote(context.db, context.product.id);
    const filler = await caller.jobs.create({ quoteId: fillerQuote.id });

    // Done: [06-05, 06-07); Active: [06-05, 06-15); Scheduled: filler holds [06-05, 06-15) so the
    // Job's slot on that bay starts 06-15, all ahead of "today".
    await caller.jobs.bookSlot({ bayId: doneBayId, durationDays: 2, jobId: job.id });
    await caller.jobs.bookSlot({ bayId: activeBayId, durationDays: 10, jobId: job.id });
    await caller.jobs.bookSlot({ bayId: scheduledBayId, durationDays: 10, jobId: filler.id });
    await caller.jobs.bookSlot({ bayId: scheduledBayId, durationDays: 2, jobId: job.id });

    vi.setSystemTime(new Date('2026-06-10T09:00:00.000+02:00'));

    const result = await caller.jobs.list({ filters: {}, include: { scheduleState: true } });

    expect(result.items.find((item) => item.id === job.id)?.scheduleState).toEqual({
      active: 1,
      done: 1,
      endDate: '2026-06-17',
      scheduled: 1,
      startDate: '2026-06-05',
      total: 3,
    });
  });

  test('filters to unscheduled Jobs and sorts by scheduled-slot count', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const unscheduled = await caller.jobs.create({ quoteId: context.quote.id });
    const scheduledQuote = await createAcceptedQuote(context.db, context.product.id);
    const scheduled = await caller.jobs.create({ quoteId: scheduledQuote.id });
    await caller.jobs.bookSlot({ bayId: doneBayId, durationDays: 1, jobId: scheduled.id });

    await expect(caller.jobs.list({ filters: { unscheduledOnly: true } })).resolves.toMatchObject({
      items: [expect.objectContaining({ id: unscheduled.id })],
      total: 1,
    });

    const sorted = await caller.jobs.list({ filters: {}, sortBy: 'scheduledSlots', sortDirection: 'asc' });
    expect(sorted.items.map((item) => item.id)).toEqual([unscheduled.id, scheduled.id]);
  });

  test('rejects callers without job:read', async ({ context }) => {
    const salesCaller = context.createCaller(mockSession('sales'));

    await expect(salesCaller.jobs.list({ filters: { unscheduledOnly: true } })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
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
          nextAvailableDate: '2026-06-07',
          slots: [
            expect.objectContaining({
              jobCode: job.code,
              startDate: '2026-06-05',
              endDate: '2026-06-07',
            }),
          ],
        }),
      ]),
    );
  });

  test('listBays returns product/customer detail only for Jobs on the board', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const scheduledJob = await caller.jobs.create({ quoteId: context.quote.id });
    const idleQuote = await createAcceptedQuote(context.db, context.product.id);
    const unscheduledJob = await caller.jobs.create({ quoteId: idleQuote.id });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 2,
      jobId: scheduledJob.id,
    });

    const schedule = await caller.jobs.listBays();

    expect(schedule.jobs).toEqual([
      expect.objectContaining({
        id: scheduledJob.id,
        productName: 'Job Test Product',
        customerCompanyName: 'Job Test Customer',
        quoteCode: scheduledJob.quoteCode,
      }),
    ]);
    expect(schedule.jobs.map((job) => job.id)).not.toContain(unscheduledJob.id);
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

    const schedule = await caller.jobs.listBays({ from: '2026-06-01' });
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

describe('jobs.bookSlot with start date', () => {
  const bayId = '00000000-0000-4000-8000-000000000b01';

  test('splits the work slot containing the picked date, preserving job and total working days', async ({
    context,
  }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({ quoteId: context.quote.id });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({ quoteId: secondQuote.id });
    await caller.jobs.bookSlot({ bayId, durationDays: 10, jobId: firstJob.id });

    await expect(
      caller.jobs.bookSlot({ bayId, durationDays: 3, jobId: secondJob.id, startDate: '2026-06-09' }),
    ).resolves.toMatchObject({
      slot: { durationDays: 3, jobId: secondJob.id, sequence: 2 },
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bayId,
          slots: [
            expect.objectContaining({
              durationDays: 4,
              jobId: firstJob.id,
              kind: 'work',
              sequence: 1,
              startDate: '2026-06-05',
            }),
            expect.objectContaining({
              durationDays: 3,
              jobId: secondJob.id,
              kind: 'work',
              sequence: 2,
              startDate: '2026-06-09',
            }),
            expect.objectContaining({
              durationDays: 6,
              jobId: firstJob.id,
              kind: 'work',
              sequence: 3,
              startDate: '2026-06-12',
            }),
          ],
        }),
      ]),
    );
  });

  test('splits a labeled idle slot identically, keeping the label on both halves', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({ quoteId: context.quote.id });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({ quoteId: secondQuote.id });
    const workSlot = await caller.jobs.bookSlot({ bayId, durationDays: 2, jobId: firstJob.id });
    await caller.jobs.addIdleSlot({
      durationDays: 6,
      label: 'Bay Tidying',
      placement: 'after',
      targetSlotId: workSlot.slot.id,
    });

    await caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: secondJob.id, startDate: '2026-06-09' });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bayId,
          slots: [
            expect.objectContaining({ jobId: firstJob.id, kind: 'work', sequence: 1 }),
            expect.objectContaining({ durationDays: 2, kind: 'idle', label: 'Bay Tidying', sequence: 2 }),
            expect.objectContaining({
              durationDays: 1,
              jobId: secondJob.id,
              kind: 'work',
              sequence: 3,
              startDate: '2026-06-09',
            }),
            expect.objectContaining({ durationDays: 4, kind: 'idle', label: 'Bay Tidying', sequence: 4 }),
          ],
        }),
      ]),
    );
  });

  test("inserts cleanly before a slot when the date is exactly that slot's projected start", async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({ quoteId: context.quote.id });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({ quoteId: secondQuote.id });
    const firstSlot = await caller.jobs.bookSlot({ bayId, durationDays: 4, jobId: firstJob.id });
    const secondSlot = await caller.jobs.bookSlot({ bayId, durationDays: 2, jobId: firstJob.id });

    const inserted = await caller.jobs.bookSlot({
      bayId,
      durationDays: 1,
      jobId: secondJob.id,
      startDate: '2026-06-09',
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bayId,
          slots: [
            expect.objectContaining({ durationDays: 4, id: firstSlot.slot.id, sequence: 1 }),
            expect.objectContaining({
              id: inserted.slot.id,
              jobId: secondJob.id,
              sequence: 2,
              startDate: '2026-06-09',
            }),
            expect.objectContaining({ durationDays: 2, id: secondSlot.slot.id, sequence: 3 }),
          ],
        }),
      ]),
    );
  });

  test('appends when the picked date is the next available day', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    await caller.jobs.bookSlot({ bayId, durationDays: 4, jobId: job.id });

    await expect(
      caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id, startDate: '2026-06-09' }),
    ).resolves.toMatchObject({
      slot: { sequence: 2 },
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bayId,
          slots: [
            expect.objectContaining({ durationDays: 4, sequence: 1 }),
            expect.objectContaining({ kind: 'work', sequence: 2, startDate: '2026-06-09' }),
          ],
        }),
      ]),
    );
  });

  test('clamps a picked date past the next available day to a plain append without idle', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    await caller.jobs.bookSlot({ bayId, durationDays: 2, jobId: job.id });

    await expect(
      caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id, startDate: '2026-06-20' }),
    ).resolves.toMatchObject({
      slot: { sequence: 2 },
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bayId,
          slots: [
            expect.objectContaining({ kind: 'work', sequence: 1 }),
            expect.objectContaining({ kind: 'work', sequence: 2, startDate: '2026-06-07' }),
          ],
        }),
      ]),
    );
  });

  test('counts split halves in working days, skipping marked off-days', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({ quoteId: context.quote.id });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({ quoteId: secondQuote.id });
    await caller.jobs.toggleOffDay({ date: '2026-06-06', isOffDay: true, label: null });
    await caller.jobs.toggleOffDay({ date: '2026-06-07', isOffDay: true, label: null });
    await caller.jobs.bookSlot({ bayId, durationDays: 10, jobId: firstJob.id });

    await caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: secondJob.id, startDate: '2026-06-09' });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: bayId,
          slots: [
            expect.objectContaining({ durationDays: 2, jobId: firstJob.id, sequence: 1 }),
            expect.objectContaining({
              durationDays: 1,
              jobId: secondJob.id,
              sequence: 2,
              startDate: '2026-06-09',
            }),
            expect.objectContaining({ durationDays: 8, jobId: firstJob.id, sequence: 3 }),
          ],
        }),
      ]),
    );
  });

  test('rejects a booking with a start date without job scheduling permissions', async ({ context }) => {
    const adminCaller = context.createCaller(mockSession('admin'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await adminCaller.jobs.create({ quoteId: context.quote.id });

    await expect(
      salesCaller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id, startDate: '2026-06-09' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('refuses a booking with a start date on a disabled bay', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    await caller.jobs.bookSlot({ bayId, durationDays: 10, jobId: job.id });
    await caller.jobs.setBayDisabled({ disabled: true, id: bayId });

    await expect(
      caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id, startDate: '2026-06-09' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('jobs.previewSchedule', () => {
  const bayId = '00000000-0000-4000-8000-000000000b01';

  test('previews the same append placement that bookSlot commits', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });

    const preview = await caller.jobs.previewSchedule({ seeds: [{ bayId, durationDays: 2 }] });

    expect(ProjectedBayQueue.parse(getBoardPreviewBay(preview, bayId))).toEqual(getBoardPreviewBay(preview, bayId));
    expect(preview.placements).toEqual([{ idleGapDays: 0, startDate: '2026-06-05', type: 'append' }]);
    expect(preview.ghosts).toEqual([
      expect.objectContaining({
        bayId,
        durationDays: 2,
        endDate: '2026-06-07',
        placementType: 'append',
        seedIndex: 0,
        startDate: '2026-06-05',
      }),
    ]);

    const booked = await caller.jobs.bookSlot({ bayId, durationDays: 2, jobId: job.id });
    const bay = getBoardBay(await caller.jobs.listBays(), bayId);

    expect(bay.slots.find((slot) => slot.id === booked.slot.id)).toMatchObject({
      endDate: preview.ghosts[0]?.endDate,
      startDate: preview.ghosts[0]?.startDate,
    });
  });

  test('previews same-bay seeds when a later seed targets an earlier preview ghost', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const job = await caller.jobs.create({ quoteId: context.quote.id });
    await caller.jobs.bookSlot({ bayId, durationDays: 1, jobId: job.id });

    const preview = await caller.jobs.previewSchedule({
      seeds: [
        { bayId, durationDays: 1, startDate: '2026-06-06' },
        { bayId, durationDays: 1, startDate: '2026-06-06' },
      ],
    });

    expect(preview.placements).toEqual([
      { idleGapDays: 0, startDate: '2026-06-06', type: 'append' },
      {
        startDate: '2026-06-06',
        targetGhost: { id: `ghost:${bayId}:0`, seedIndex: 0 },
        targetKind: 'ghost',
        type: 'insert-before',
      },
    ]);
    expect(preview.ghosts).toEqual([
      expect.objectContaining({
        bayId,
        endDate: '2026-06-08',
        id: `ghost:${bayId}:0`,
        placementType: 'append',
        seedIndex: 0,
        startDate: '2026-06-07',
      }),
      expect.objectContaining({
        bayId,
        endDate: '2026-06-07',
        id: `ghost:${bayId}:1`,
        placementType: 'insert-before',
        seedIndex: 1,
        startDate: '2026-06-06',
      }),
    ]);
  });

  test('keeps global seed indexes across a multi-Bay preview request', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const paintBayId = '00000000-0000-4000-8000-000000000b02';

    const preview = await caller.jobs.previewSchedule({
      seeds: [
        { bayId, durationDays: 1 },
        { bayId: paintBayId, durationDays: 1 },
        { bayId, durationDays: 2 },
      ],
    });

    expect(preview.placements).toHaveLength(3);
    expect(preview.ghosts.map((ghost) => ({ id: ghost.id, seedIndex: ghost.seedIndex }))).toEqual([
      { id: `ghost:${bayId}:0`, seedIndex: 0 },
      { id: `ghost:${paintBayId}:1`, seedIndex: 1 },
      { id: `ghost:${bayId}:2`, seedIndex: 2 },
    ]);
    expect(preview.bays.map((bay) => bay.id).sort()).toEqual([bayId, paintBayId].sort());
  });

  test('returns affected preview Bays through the same schedule window', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const historicalJob = await caller.jobs.create({ quoteId: context.quote.id });

    await setBayScheduleOrigin(context.db, bayId, '2026-06-01');
    const historicalSlot = await seedWorkSlot(context.db, {
      bayId,
      durationDays: 2,
      jobId: historicalJob.id,
      sequence: 1,
    });

    const defaultPreview = await caller.jobs.previewSchedule({ seeds: [{ bayId, durationDays: 1 }] });
    const widenedPreview = await caller.jobs.previewSchedule({
      from: '2026-06-03',
      seeds: [{ bayId, durationDays: 1 }],
    });

    expect(getBoardPreviewBay(defaultPreview, bayId).slots.map((slot) => slot.id)).not.toContain(historicalSlot.id);
    expect(getBoardPreviewBay(widenedPreview, bayId).slots).toEqual([
      expect.objectContaining({
        endDate: '2026-06-03',
        id: historicalSlot.id,
        jobId: historicalJob.id,
        startDate: '2026-06-01',
      }),
    ]);
  });

  test('uses cross-bay route state when windowing affected preview Bays', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const routeJob = await caller.jobs.create({ quoteId: context.quote.id });
    const activeBayId = '00000000-0000-4000-8000-000000000b02';

    await setBayScheduleOrigin(context.db, bayId, '2026-06-01');
    await setBayScheduleOrigin(context.db, activeBayId, '2026-06-04');
    const doneSeededBaySlot = await seedWorkSlot(context.db, {
      bayId,
      durationDays: 2,
      jobId: routeJob.id,
      sequence: 1,
    });
    await seedWorkSlot(context.db, {
      bayId: activeBayId,
      durationDays: 3,
      jobId: routeJob.id,
      sequence: 1,
    });

    const preview = await caller.jobs.previewSchedule({ seeds: [{ bayId, durationDays: 1 }] });

    expect(preview.bays.map((bay) => bay.id)).toEqual([bayId]);
    expect(getBoardPreviewBay(preview, bayId).slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          endDate: '2026-06-03',
          id: doneSeededBaySlot.id,
          jobId: routeJob.id,
          startDate: '2026-06-01',
        }),
      ]),
    );
  });

  test("previews the same insert-before placement that bookSlot commits at a slot's start", async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({ quoteId: context.quote.id });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({ quoteId: secondQuote.id });
    const firstSlot = await caller.jobs.bookSlot({ bayId, durationDays: 4, jobId: firstJob.id });
    const secondSlot = await caller.jobs.bookSlot({ bayId, durationDays: 2, jobId: firstJob.id });

    const preview = await caller.jobs.previewSchedule({
      seeds: [{ bayId, durationDays: 1, startDate: '2026-06-09' }],
    });

    expect(preview.placements[0]).toMatchObject({
      startDate: '2026-06-09',
      targetSlot: { id: secondSlot.slot.id },
      type: 'insert-before',
    });
    expect(preview.ghosts[0]).toMatchObject({
      endDate: '2026-06-10',
      placementType: 'insert-before',
      startDate: '2026-06-09',
    });
    expect(getBoardPreviewBay(preview, bayId).slots.map((slot) => [slot.id, slot.startDate])).toEqual([
      [firstSlot.slot.id, '2026-06-05'],
      [secondSlot.slot.id, '2026-06-10'],
    ]);

    const inserted = await caller.jobs.bookSlot({
      bayId,
      durationDays: 1,
      jobId: secondJob.id,
      startDate: '2026-06-09',
    });
    const bay = getBoardBay(await caller.jobs.listBays(), bayId);

    expect(bay.slots.map((slot) => [slot.id, slot.startDate])).toEqual([
      [firstSlot.slot.id, '2026-06-05'],
      [inserted.slot.id, preview.ghosts[0]?.startDate],
      [secondSlot.slot.id, '2026-06-10'],
    ]);
  });

  test('previews the same split placement that bookSlot commits inside an existing slot', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({ quoteId: context.quote.id });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({ quoteId: secondQuote.id });
    const firstSlot = await caller.jobs.bookSlot({ bayId, durationDays: 10, jobId: firstJob.id });

    const preview = await caller.jobs.previewSchedule({
      seeds: [{ bayId, durationDays: 3, startDate: '2026-06-09' }],
    });

    expect(preview.placements[0]).toMatchObject({
      afterDays: 6,
      beforeDays: 4,
      startDate: '2026-06-09',
      targetSlot: { id: firstSlot.slot.id },
      type: 'split',
    });
    expect(preview.ghosts[0]).toMatchObject({
      endDate: '2026-06-12',
      placementType: 'split',
      startDate: '2026-06-09',
    });
    expect(getBoardPreviewBay(preview, bayId).slots).toEqual([
      expect.objectContaining({
        durationDays: 4,
        id: `${firstSlot.slot.id}:before`,
        jobUnfinished: true,
        previewSplit: { half: 'before', sourceSlotId: firstSlot.slot.id },
        state: 'active',
      }),
      expect.objectContaining({
        durationDays: 6,
        id: `${firstSlot.slot.id}:after`,
        jobUnfinished: true,
        previewSplit: { half: 'after', sourceSlotId: firstSlot.slot.id },
        state: 'scheduled',
      }),
    ]);

    const inserted = await caller.jobs.bookSlot({
      bayId,
      durationDays: 3,
      jobId: secondJob.id,
      startDate: '2026-06-09',
    });
    const bay = getBoardBay(await caller.jobs.listBays(), bayId);

    expect(bay.slots.map((slot) => [slot.id, slot.durationDays, slot.startDate])).toEqual([
      [firstSlot.slot.id, 4, '2026-06-05'],
      [inserted.slot.id, 3, preview.ghosts[0]?.startDate],
      [expect.any(String), 6, '2026-06-12'],
    ]);
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
              startDate: '2026-06-05',
              endDate: '2026-06-07',
            }),
            expect.objectContaining({
              jobCode: secondJob.code,
              startDate: '2026-06-07',
              endDate: '2026-06-08',
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
              startDate: '2026-06-05',
              endDate: '2026-06-06',
            }),
            expect.objectContaining({
              id: workSlot.slot.id,
              jobCode: job.code,
              kind: 'work',
              startDate: '2026-06-06',
              endDate: '2026-06-07',
            }),
          ],
        }),
      ]),
    );
  });
});

describe('jobs.moveSlot', () => {
  test('moves an authorized slot and returns it', async ({ context }) => {
    const caller = context.createCaller(mockSession('admin'));
    const firstJob = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const secondQuote = await createAcceptedQuote(context.db, context.product.id);
    const secondJob = await caller.jobs.create({
      quoteId: secondQuote.id,
    });
    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: firstJob.id,
    });
    const secondSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobId: secondJob.id,
    });

    await expect(
      caller.jobs.moveSlot({
        direction: 'left',
        slotId: secondSlot.slot.id,
      }),
    ).resolves.toMatchObject({
      slot: {
        id: secondSlot.slot.id,
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
      salesCaller.jobs.moveSlot({
        direction: 'left',
        slotId: slot.slot.id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('listBays returns projected slots in moved order', async ({ context }) => {
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
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 1,
      jobId: firstJob.id,
    });
    const secondSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 1,
      jobId: secondJob.id,
    });
    const thirdSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 2,
      jobId: thirdJob.id,
    });

    await caller.jobs.moveSlot({
      direction: 'right',
      slotId: secondSlot.slot.id,
    });

    const schedule = await caller.jobs.listBays();
    expect(schedule.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: '00000000-0000-4000-8000-000000000b03',
          slots: [
            expect.objectContaining({
              id: firstSlot.slot.id,
              sequence: 1,
            }),
            expect.objectContaining({
              id: thirdSlot.slot.id,
              sequence: 2,
            }),
            expect.objectContaining({
              id: secondSlot.slot.id,
              sequence: 3,
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
          nextAvailableDate: '2026-06-07',
          slots: [
            expect.objectContaining({
              id: secondSlot.slot.id,
              jobCode: secondJob.code,
              sequence: 1,
              startDate: '2026-06-05',
              endDate: '2026-06-06',
            }),
            expect.objectContaining({
              jobCode: thirdJob.code,
              sequence: 2,
              startDate: '2026-06-06',
              endDate: '2026-06-07',
            }),
          ],
        }),
      ]),
    );
  });
});

function getBoardBay(board: BoardListResult, bayId: string) {
  const bay = board.items.find((item) => item.id === bayId);

  if (!bay) {
    throw new Error(`Expected schedule to include Bay ${bayId}`);
  }

  return bay;
}

function getBoardPreviewBay(preview: BoardPreviewResult, bayId: string) {
  const bay = preview.bays.find((item) => item.id === bayId);

  if (!bay) {
    throw new Error(`Expected Board preview to include Bay ${bayId}`);
  }

  return bay;
}

async function setBayScheduleOrigin(db: Db, bayId: string, scheduleOrigin: string): Promise<void> {
  await db.execute(sql`
    UPDATE "job_bay"
    SET "schedule_origin" = ${scheduleOrigin}
    WHERE "id" = ${bayId}
  `);
}

async function seedWorkSlot(
  db: Db,
  input: {
    bayId: string;
    durationDays: number;
    jobId: string;
    sequence: number;
  },
) {
  const [slot] = await db
    .insert(jobSlots)
    .values({
      bayId: input.bayId,
      durationDays: input.durationDays,
      jobId: input.jobId,
      kind: 'work',
      label: null,
      sequence: input.sequence,
    })
    .returning();

  if (!slot) {
    throw new Error('Job Slot insert did not return a row');
  }

  return slot;
}

async function createProduct(db: Db): Promise<Pick<Product, 'id'>> {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      currencyCode: 'ZAR',
      description: null,
      buildTimeDays: 14,
      modelCode: 'JOB-TEST',
      name: 'Job Test Product',
      rangeId,
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
        scheduleOrigin: toPlantDateOnly(now),
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b02',
        name: 'Fabrication Bay 2',
        scheduleOrigin: toPlantDateOnly(now),
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b03',
        name: 'Fabrication Bay 3',
        scheduleOrigin: toPlantDateOnly(now),
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b04',
        name: 'Fabrication Bay 4',
        scheduleOrigin: toPlantDateOnly(now),
        updatedAt: now,
      },
      {
        createdAt: now,
        department: 'fabrication',
        id: '00000000-0000-4000-8000-000000000b05',
        name: 'Fabrication Bay 5',
        scheduleOrigin: toPlantDateOnly(now),
        updatedAt: now,
      },
    ])
    .onConflictDoUpdate({
      target: jobBays.id,
      set: {
        department: 'fabrication',
        scheduleOrigin: toPlantDateOnly(now),
        updatedAt: now,
      },
    });
}

async function createUser(
  db: Db,
  input: {
    email: string;
    id: string;
    name: string;
    role: 'bay-operator' | 'sales';
  },
) {
  const now = new Date('2026-06-05T00:00:00.000Z');

  await db.insert(user).values({
    createdAt: now,
    email: input.email,
    emailVerified: true,
    id: input.id,
    name: input.name,
    role: input.role,
    updatedAt: now,
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
