import {
  customers,
  type Db,
  jobBayCalendarExceptions,
  jobBays,
  jobs,
  products,
  quotes,
  user,
  workingCalendarOffDays,
} from '@pkg/db';
import {
  AddBayCalendarExceptionInput,
  type BrochurePdfRenderer,
  type Department,
  type JobDetail,
  RemoveBayCalendarExceptionInput,
  ToggleOffDayInput,
} from '@pkg/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { createTester } from '../test/create-tester.js';
import { InMemoryStorageAdapter } from '../test/in-memory-storage-adapter.js';
import { createProductRangeFixture } from '../test/product-range-fixtures.js';
import { listBays } from './job-read-service.js';
import { bookJobSlot, createJob } from './job-service.js';
import { addBayCalendarException, removeBayCalendarException, toggleOffDay } from './working-calendar-service.js';

const actorUserId = 'test-user-id';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-05T09:00:00.000+02:00'));
});

afterEach(() => {
  vi.useRealTimers();
});

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProduct(db);

  return {
    db,
    product,
  };
});

describe('toggleOffDay', () => {
  test('inserts, updates, and removes org Off-Days for calendar editors', async ({ context }) => {
    await expect(
      toggleOffDay({
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: true, label: '  Youth Day  ' }),
      }),
    ).resolves.toEqual({
      offDay: {
        date: '2026-06-16',
        label: 'Youth Day',
      },
    });
    await expect(
      toggleOffDay({
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: true, label: null }),
      }),
    ).resolves.toEqual({
      offDay: {
        date: '2026-06-16',
        label: null,
      },
    });
    await expect(
      toggleOffDay({
        db: context.db,
        input: offDayInput({ date: '2026-06-16', isOffDay: false, label: null }),
      }),
    ).resolves.toEqual({ offDay: null });

    const rows = await context.db.select().from(workingCalendarOffDays);
    expect(rows).toEqual([]);
  });

  test('returns Off-Day facts and reflows Bay projections', async ({ context }) => {
    const bay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.product.id);
    const secondJob = await createAcceptedJob(context.db, context.product.id);
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: 'Shutdown' }),
    });

    const firstSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: firstJob.id },
    });
    const secondSlot = await bookJobSlot({
      db: context.db,
      input: { bayId: bay.id, durationDays: 1, jobId: secondJob.id },
    });

    const schedule = await listBays({ db: context.db });
    expect(schedule.offDays).toEqual([{ date: '2026-06-06', label: 'Shutdown' }]);
    expect(getProjectedBayQueue(schedule, bay.id)).toEqual(
      expect.objectContaining({
        slots: [
          expect.objectContaining({
            id: firstSlot.slot.id,
            startDate: '2026-06-05',
            endDate: '2026-06-06',
          }),
          expect.objectContaining({
            id: secondSlot.slot.id,
            startDate: '2026-06-06',
            endDate: '2026-06-08',
          }),
        ],
      }),
    );
  });
});

describe('Bay calendar exceptions', () => {
  test("rejects calendar changes that would reflow a cancelled Job's retained slot", async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });
    const job = await createAcceptedJob(context.db, context.product.id);
    await addBayCalendarException({
      db: context.db,
      input: bayExceptionInput({ bayId: bay.id, date: '2026-06-07', direction: 'off', label: 'Existing closure' }),
    });
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 3, jobId: job.id } });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      addBayCalendarException({
        db: context.db,
        input: bayExceptionInput({ bayId: bay.id, date: '2026-06-08', direction: 'off', label: null }),
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
    await expect(
      removeBayCalendarException({
        db: context.db,
        input: removeBayExceptionInput({ bayId: bay.id, date: '2026-06-07' }),
      }),
    ).rejects.toMatchObject({ code: 'job.cancelled', metadata: { id: job.id } });
  });

  test("allows calendar changes after a cancelled Job's retained slot", async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication', scheduleOrigin: '2026-06-01' });
    const job = await createAcceptedJob(context.db, context.product.id);
    await bookJobSlot({ db: context.db, input: { bayId: bay.id, durationDays: 2, jobId: job.id } });
    await context.db.update(jobs).set({ cancelledAt: new Date() }).where(eq(jobs.id, job.id));

    await expect(
      addBayCalendarException({
        db: context.db,
        input: bayExceptionInput({ bayId: bay.id, date: '2026-06-20', direction: 'off', label: 'Future closure' }),
      }),
    ).resolves.toMatchObject({ exception: { date: '2026-06-20' } });
    await expect(
      removeBayCalendarException({
        db: context.db,
        input: removeBayExceptionInput({ bayId: bay.id, date: '2026-06-20' }),
      }),
    ).resolves.toMatchObject({ exception: { date: '2026-06-20' } });
  });

  test('inserts, updates, and removes Bay exceptions for authorized schedulers', async ({ context }) => {
    const bay = await createBay(context.db, { department: 'fabrication' });

    await expect(
      addBayCalendarException({
        db: context.db,
        input: bayExceptionInput({
          bayId: bay.id,
          date: '2026-06-06',
          direction: 'work',
          label: '  Saturday push  ',
        }),
      }),
    ).resolves.toEqual({
      exception: {
        bayId: bay.id,
        date: '2026-06-06',
        direction: 'work',
        label: 'Saturday push',
      },
    });
    await expect(
      addBayCalendarException({
        db: context.db,
        input: bayExceptionInput({
          bayId: bay.id,
          date: '2026-06-06',
          direction: 'off',
          label: null,
        }),
      }),
    ).resolves.toEqual({
      exception: {
        bayId: bay.id,
        date: '2026-06-06',
        direction: 'off',
        label: null,
      },
    });
    await expect(
      removeBayCalendarException({
        db: context.db,
        input: removeBayExceptionInput({ bayId: bay.id, date: '2026-06-06' }),
      }),
    ).resolves.toEqual({
      exception: {
        bayId: bay.id,
        date: '2026-06-06',
        direction: 'off',
        label: null,
      },
    });
    await expect(
      removeBayCalendarException({
        db: context.db,
        input: removeBayExceptionInput({ bayId: bay.id, date: '2026-06-06' }),
      }),
    ).resolves.toEqual({ exception: null });

    const rows = await context.db.select().from(jobBayCalendarExceptions);
    expect(rows).toEqual([]);
  });

  test('rejects missing Bays', async ({ context }) => {
    await expect(
      addBayCalendarException({
        db: context.db,
        input: bayExceptionInput({
          bayId: '00000000-0000-4000-8000-00000000dead',
          date: '2026-06-06',
          direction: 'work',
          label: null,
        }),
      }),
    ).rejects.toThrow('Job bay not found');
  });

  test('opens an org Off-Day for one Bay only and reflows back after removal', async ({ context }) => {
    const firstBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const secondBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.product.id);
    const secondJob = await createAcceptedJob(context.db, context.product.id);
    await toggleOffDay({
      db: context.db,
      input: offDayInput({ date: '2026-06-06', isOffDay: true, label: 'Shutdown' }),
    });
    await addBayCalendarException({
      db: context.db,
      input: bayExceptionInput({ bayId: firstBay.id, date: '2026-06-06', direction: 'work', label: 'Overtime' }),
    });

    await bookJobSlot({
      db: context.db,
      input: { bayId: firstBay.id, durationDays: 2, jobId: firstJob.id },
    });
    await bookJobSlot({
      db: context.db,
      input: { bayId: secondBay.id, durationDays: 2, jobId: secondJob.id },
    });

    let schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, firstBay.id)).toEqual(
      expect.objectContaining({
        calendarExceptions: [{ bayId: firstBay.id, date: '2026-06-06', direction: 'work', label: 'Overtime' }],
        nextAvailableDate: '2026-06-07',
      }),
    );
    expect(getProjectedBayQueue(schedule, secondBay.id)).toEqual(
      expect.objectContaining({
        calendarExceptions: [],
        nextAvailableDate: '2026-06-08',
      }),
    );

    await removeBayCalendarException({
      db: context.db,
      input: removeBayExceptionInput({ bayId: firstBay.id, date: '2026-06-06' }),
    });

    schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, firstBay.id)).toEqual(
      expect.objectContaining({
        calendarExceptions: [],
        nextAvailableDate: '2026-06-08',
      }),
    );
  });

  test('closes an otherwise-working day for one Bay only', async ({ context }) => {
    const firstBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const secondBay = await createBay(context.db, {
      department: 'fabrication',
      scheduleOrigin: '2026-06-05',
    });
    const firstJob = await createAcceptedJob(context.db, context.product.id);
    const secondJob = await createAcceptedJob(context.db, context.product.id);

    await addBayCalendarException({
      db: context.db,
      input: bayExceptionInput({ bayId: firstBay.id, date: '2026-06-06', direction: 'off', label: 'Maintenance' }),
    });
    await bookJobSlot({
      db: context.db,
      input: { bayId: firstBay.id, durationDays: 2, jobId: firstJob.id },
    });
    await bookJobSlot({
      db: context.db,
      input: { bayId: secondBay.id, durationDays: 2, jobId: secondJob.id },
    });

    const schedule = await listBays({ db: context.db });
    expect(getProjectedBayQueue(schedule, firstBay.id)).toEqual(
      expect.objectContaining({
        nextAvailableDate: '2026-06-08',
      }),
    );
    expect(getProjectedBayQueue(schedule, secondBay.id)).toEqual(
      expect.objectContaining({
        nextAvailableDate: '2026-06-07',
      }),
    );
  });
});

async function createActorUser(db: Db) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: actorUserId,
    name: 'Test User',
    role: 'sales',
    updatedAt: now,
  });
}

async function createProduct(db: Db) {
  const rangeId = await createProductRangeFixture(db);
  const [product] = await db
    .insert(products)
    .values({
      basePrice: 1_000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      description: null,
      modelCode: 'CAL-001',
      name: 'Calendar Test Product',
      rangeId,
    })
    .returning();

  if (!product) throw new Error('Product insert did not return a row');

  return product;
}

async function createBay(
  db: Db,
  {
    department,
    scheduleOrigin = '2026-06-05',
  }: {
    department: Department;
    scheduleOrigin?: string;
  },
) {
  const [bay] = await db
    .insert(jobBays)
    .values({
      department,
      name: `${department} Test Bay`,
      scheduleOrigin,
    })
    .returning();

  if (!bay) {
    throw new Error('Bay insert did not return a row');
  }

  return bay;
}

function getProjectedBayQueue(schedule: Awaited<ReturnType<typeof listBays>>, bayId: string) {
  const bay = schedule.items.find((item) => item.id === bayId);

  if (!bay) {
    throw new Error(`Projected Bay Queue not found: ${bayId}`);
  }

  return bay;
}

function offDayInput(input: Parameters<typeof ToggleOffDayInput.parse>[0]) {
  return ToggleOffDayInput.parse(input);
}

function bayExceptionInput(input: Parameters<typeof AddBayCalendarExceptionInput.parse>[0]) {
  return AddBayCalendarExceptionInput.parse(input);
}

function removeBayExceptionInput(input: Parameters<typeof RemoveBayCalendarExceptionInput.parse>[0]) {
  return RemoveBayCalendarExceptionInput.parse(input);
}

async function createAcceptedJob(db: Db, productId: string): Promise<JobDetail> {
  const [customer] = await db
    .insert(customers)
    .values({
      companyName: 'Calendar Test Customer',
      email: null,
    })
    .returning();
  if (!customer) throw new Error('Customer insert did not return a row');

  const [quote] = await db
    .insert(quotes)
    .values({
      customerId: customer.id,
      productId,
      quotedBasePrice: 1_000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: actorUserId,
      status: 'accepted',
    })
    .returning();
  if (!quote) throw new Error('Quote insert did not return a row');

  const brochureRenderer: BrochurePdfRenderer = async () => new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  return createJob({
    actorUserId,
    brochureRenderer,
    db,
    storage: new InMemoryStorageAdapter(),
    input: { baySeeds: [], quoteId: quote.id },
  });
}
