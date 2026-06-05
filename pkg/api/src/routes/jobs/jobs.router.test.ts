import { customers, type Db, jobBays, products, quotes, sql } from '@pkg/db';
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
  await createActorUser(db, 'job-supervisor');
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
    const caller = context.createCaller(mockSession('job-supervisor'));

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
});

describe('jobs.create', () => {
  test('creates a job with the production stage model', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));

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
    expect(job.stages.map((stage) => stage.stage)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
  });

  test('returns the product serial number from get and list, and can search by it', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
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
  test('books an authorized job stage onto a fabrication bay', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const fabricationStage = getStage(job, 'fabrication');

    await expect(
      caller.jobs.bookSlot({
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 1,
        jobStageId: fabricationStage.id,
      }),
    ).resolves.toMatchObject({
      slot: {
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 1,
        jobStageId: fabricationStage.id,
        sequence: 1,
      },
    });
  });

  test('rejects users without job scheduling permissions', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await supervisorCaller.jobs.create({
      quoteId: context.quote.id,
    });

    await expect(
      salesCaller.jobs.bookSlot({
        bayId: '00000000-0000-4000-8000-000000000b01',
        durationDays: 1,
        jobStageId: getStage(job, 'fabrication').id,
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('listBays returns projected slots after booking', async ({ context }) => {
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 2,
      jobStageId: getStage(job, 'fabrication').id,
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
    const caller = context.createCaller(mockSession('job-supervisor'));
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
      jobStageId: getStage(job, 'fabrication').id,
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
    const caller = context.createCaller(mockSession('job-supervisor'));
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
      jobStageId: getStage(firstJob, 'fabrication').id,
    });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b03',
      durationDays: 1,
      jobStageId: getStage(secondJob, 'fabrication').id,
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
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await supervisorCaller.jobs.create({
      quoteId: context.quote.id,
    });
    const slot = await supervisorCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobStageId: getStage(job, 'fabrication').id,
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
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const workSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b04',
      durationDays: 1,
      jobStageId: getStage(job, 'fabrication').id,
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
        jobStageId: null,
        kind: 'idle',
        label: null,
        sequence: 2,
      },
    });
  });

  test('rejects users without job scheduling permissions', async ({ context }) => {
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await supervisorCaller.jobs.create({
      quoteId: context.quote.id,
    });
    const workSlot = await supervisorCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobStageId: getStage(job, 'fabrication').id,
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
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const workSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b05',
      durationDays: 1,
      jobStageId: getStage(job, 'fabrication').id,
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
    const caller = context.createCaller(mockSession('job-supervisor'));
    const job = await caller.jobs.create({
      quoteId: context.quote.id,
    });
    const slot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobStageId: getStage(job, 'fabrication').id,
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
    const supervisorCaller = context.createCaller(mockSession('job-supervisor'));
    const salesCaller = context.createCaller(mockSession('sales'));
    const job = await supervisorCaller.jobs.create({
      quoteId: context.quote.id,
    });
    const slot = await supervisorCaller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b01',
      durationDays: 1,
      jobStageId: getStage(job, 'fabrication').id,
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
    const caller = context.createCaller(mockSession('job-supervisor'));
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
      jobStageId: getStage(firstJob, 'fabrication').id,
    });
    const secondSlot = await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 1,
      jobStageId: getStage(secondJob, 'fabrication').id,
    });

    await caller.jobs.bookSlot({
      bayId: '00000000-0000-4000-8000-000000000b02',
      durationDays: 1,
      jobStageId: getStage(thirdJob, 'fabrication').id,
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

function getStage(job: { stages: { id: string; stage: string }[] }, stageName: string) {
  const stage = job.stages.find((item) => item.stage === stageName);

  if (!stage) {
    throw new Error(`Job stage not found: ${stageName}`);
  }

  return stage;
}
