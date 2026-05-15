import { pathToFileURL } from 'node:url';
import { demoUsers, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { JobLifecycleStatus, JobStageName, JobStageStatus } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Db } from './database-client.js';
import { auditEvents } from './schema/audit.js';
import { account, user, userDepartment } from './schema/auth.js';
import { jobStages, jobs } from './schema/job.js';
import { products } from './schema/product.js';
import { productOptions } from './schema/product-option.js';

const seedProductCount = 10;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const seedProductMinAgeDays = 7;
const seedProductAgeDayRange = 22;

const equipmentFamilies = [
  'Wheel Loader',
  'Excavator',
  'Skid Steer',
  'Backhoe Loader',
  'Telehandler',
  'Motor Grader',
  'Dozer',
  'Dump Truck',
  'Compactor',
  'Forklift',
] as const;

const equipmentSeries = ['Atlas', 'Summit', 'Vertex', 'Forge', 'Apex'] as const;

const seedJobScenarios = [
  {
    lifecycleStatus: 'active',
    stageProgress: null,
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'procurement', status: 'ordering' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'procurement', status: 'partial' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'fabrication', status: 'cutting' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'fabrication', status: 'welding' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'assembly', status: 'in-progress' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'assembly', status: 'qc' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'paint', status: 'prep' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'paint', status: 'painting' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'paint', status: 'curing' },
  },
  {
    lifecycleStatus: 'active',
    stageProgress: { stage: 'dispatch', status: 'ready' },
  },
  {
    lifecycleStatus: 'complete',
    stageProgress: 'complete',
  },
  {
    lifecycleStatus: 'paused',
    stageProgress: { stage: 'assembly', status: 'in-progress' },
  },
  {
    lifecycleStatus: 'cancelled',
    stageProgress: { stage: 'fabrication', status: 'qc' },
  },
] as const satisfies readonly SeedJobScenario[];

type SeedProduct = typeof products.$inferInsert & {
  id: string;
  name: string;
  modelCode: string;
  basePrice: number;
  currencyCode: string;
  description: string;
};

type SeedProductOption = typeof productOptions.$inferInsert & {
  id: string;
  productId: string;
  name: string;
  code: string;
  price: number;
};

type SeedJob = typeof jobs.$inferInsert & {
  id: string;
  productId: string;
  lifecycleStatus: JobLifecycleStatus;
  createdAt: Date;
  updatedAt: Date;
};

type SeedJobStage = typeof jobStages.$inferInsert & {
  id: string;
  jobId: string;
  sequence: number;
  stage: JobStageName;
  status: JobStageStatus;
  startedAt: Date | null;
  completedAt: Date | null;
};

type SeedJobs = {
  jobs: SeedJob[];
  stages: SeedJobStage[];
};

type SeedJobScenario = {
  lifecycleStatus: JobLifecycleStatus;
  stageProgress: { stage: JobStageName; status: JobStageStatus } | 'complete' | null;
};

type SeedProductAuditChange = {
  from: unknown;
  to: unknown;
};

type SeedProductAuditChanges = Record<string, SeedProductAuditChange>;

type SeedTimelineProduct = SeedProduct & {
  createdAt: Date;
  updatedAt: Date;
};

type SeedAuditEvent = Omit<
  typeof auditEvents.$inferInsert,
  'action' | 'changes' | 'entityId' | 'entityType' | 'id' | 'occurredAt' | 'summary'
> & {
  id: string;
  action: 'created' | 'updated';
  changes: SeedProductAuditChanges | null;
  entityId: string;
  entityType: 'product';
  occurredAt: Date;
  summary: string;
};

type SeedProductAuditTimeline = {
  products: SeedTimelineProduct[];
  auditEvents: SeedAuditEvent[];
};

type CreateSeedProductAuditTimelineInput = {
  actorUserIds: readonly string[];
  now: Date;
  products: readonly SeedProduct[];
};

export function createSeedProducts(count = seedProductCount): SeedProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const family = equipmentFamilies[index % equipmentFamilies.length] ?? equipmentFamilies[0];
    const series = equipmentSeries[index % equipmentSeries.length] ?? equipmentSeries[0];
    const sequence = index + 1;

    return {
      id: createSeedUuid('8000', sequence),
      basePrice: 125_000 + sequence * 18_750,
      currencyCode: 'ZAR',
      description: `${series} ${family.toLowerCase()} configured for local demo inventory.`,
      modelCode: `JED-${family
        .split(' ')
        .map((part) => part[0])
        .join('')}-${String(sequence).padStart(3, '0')}`,
      name: `${series} ${family} ${String(sequence).padStart(3, '0')}`,
    };
  });
}

export function createSeedProductOptions(productsToSeed: readonly SeedTimelineProduct[]): SeedProductOption[] {
  return productsToSeed.flatMap((product, productIndex) => {
    const sequence = productIndex + 1;
    const options = [
      {
        code: 'CAB',
        name: 'Enclosed Cab',
        price: 11_500 + sequence * 250,
      },
      {
        code: 'HYD',
        name: 'Auxiliary Hydraulics',
        price: 18_000 + sequence * 400,
      },
      {
        code: 'GPS',
        name: 'Fleet GPS Kit',
        price: 7_500 + sequence * 175,
      },
    ] as const;

    return options.map((option, optionIndex) => ({
      ...option,
      createdAt: product.createdAt,
      deletedAt: null,
      id: createSeedUuid('8002', productIndex * options.length + optionIndex + 1),
      productId: product.id,
      updatedAt: product.updatedAt,
    }));
  });
}

export function createSeedJobs({
  now,
  products: productsToSeed,
}: {
  now: Date;
  products: readonly SeedTimelineProduct[];
}): SeedJobs {
  if (productsToSeed.length === 0) {
    return {
      jobs: [],
      stages: [],
    };
  }

  const jobsToSeed = seedJobScenarios.map((scenario, jobIndex) => {
    const product = productsToSeed[jobIndex % productsToSeed.length];

    if (!product) {
      throw new Error('Seed job product lookup failed');
    }

    const createdAt = createJobCreatedAt(now, jobIndex);
    const stages = createSeedJobStages({
      createdAt,
      jobId: createSeedUuid('8003', jobIndex + 1),
      jobIndex,
      scenario,
    });
    const updatedAt =
      stages.reduce<Date | null>((latest, stage) => {
        const stageUpdatedAt = stage.completedAt ?? stage.startedAt;

        if (!stageUpdatedAt) {
          return latest;
        }

        if (!latest || stageUpdatedAt.getTime() > latest.getTime()) {
          return stageUpdatedAt;
        }

        return latest;
      }, null) ?? createdAt;

    return {
      job: {
        id: createSeedUuid('8003', jobIndex + 1),
        createdAt,
        lifecycleStatus: scenario.lifecycleStatus,
        productId: product.id,
        updatedAt,
      },
      stages,
    };
  });

  return {
    jobs: jobsToSeed.map(({ job }) => job),
    stages: jobsToSeed.flatMap(({ stages }) => stages),
  };
}

export function createSeedProductAuditTimeline({
  actorUserIds,
  now,
  products: seedProducts,
}: CreateSeedProductAuditTimelineInput): SeedProductAuditTimeline {
  if (actorUserIds.length === 0) {
    throw new Error('At least one actor user is required to seed product audits');
  }

  const productsWithTimeline: SeedTimelineProduct[] = [];
  const auditEventsWithoutIds: Omit<SeedAuditEvent, 'id'>[] = [];

  seedProducts.forEach((seedProduct, productIndex) => {
    const createdAt = createProductCreatedAt(now, productIndex);
    const actorUserId = actorUserIds[productIndex % actorUserIds.length] ?? actorUserIds[0];
    let currentProduct: SeedTimelineProduct = {
      ...seedProduct,
      createdAt,
      updatedAt: createdAt,
    };
    let updateOrdinal = 0;

    auditEventsWithoutIds.push({
      action: 'created',
      actorUserId,
      changes: null,
      entityId: seedProduct.id,
      entityType: 'product',
      occurredAt: createdAt,
      summary: `Created product "${seedProduct.name}"`,
    });

    const ageDays = getSeedProductAgeDays(productIndex);

    for (let dayIndex = 1; dayIndex <= ageDays; dayIndex += 1) {
      const updatesForDay = getSeedProductUpdateCount(productIndex, dayIndex);
      const updateDate = addUtcDays(createdAt, dayIndex);

      for (let updateIndex = 0; updateIndex < updatesForDay; updateIndex += 1) {
        updateOrdinal += 1;

        const occurredAt = createProductUpdateOccurredAt({
          dayIndex,
          now,
          productIndex,
          updateDate,
          updateIndex,
          updatesForDay,
        });
        const { changes, product } = applySeedProductUpdate({
          dayIndex,
          product: currentProduct,
          productIndex,
          updateIndex,
          updateOrdinal,
        });

        currentProduct = {
          ...product,
          updatedAt: occurredAt,
        };

        auditEventsWithoutIds.push({
          action: 'updated',
          actorUserId,
          changes,
          entityId: seedProduct.id,
          entityType: 'product',
          occurredAt,
          summary: `Updated product "${seedProduct.name}"`,
        });
      }
    }

    productsWithTimeline.push(currentProduct);
  });

  const auditEvents = auditEventsWithoutIds
    .sort((left, right) => {
      const occurredAtComparison = left.occurredAt.getTime() - right.occurredAt.getTime();

      if (occurredAtComparison !== 0) {
        return occurredAtComparison;
      }

      return `${left.entityId}:${left.action}:${left.summary}`.localeCompare(
        `${right.entityId}:${right.action}:${right.summary}`,
      );
    })
    .map((event, index) => ({
      ...event,
      id: createSeedUuid('8001', index + 1),
    }));

  return {
    auditEvents,
    products: productsWithTimeline,
  };
}

export async function seedDatabase(database?: Db): Promise<void> {
  const activeDb = database ?? (await import('./client.js')).db;
  const now = new Date();
  const seedProducts = createSeedProducts();
  const seedUserEmails = demoUsers.map((seedUser) => seedUser.email).join(', ');
  const seedUserIds = demoUsers.map((seedUser) => seedUser.id);
  const seedUserDepartments = demoUsers.flatMap((seedUser) =>
    seedUser.departments.map((department) => ({
      department,
      userId: seedUser.id,
    })),
  );
  const productEditorUserIds = demoUsers
    .filter((seedUser) => seedUser.role === 'product-editor')
    .map((seedUser) => seedUser.id);

  if (productEditorUserIds.length === 0) {
    throw new Error('At least one product-editor seed user is required to seed product audits');
  }

  const seedProductTimeline = createSeedProductAuditTimeline({
    actorUserIds: productEditorUserIds,
    now,
    products: seedProducts,
  });
  const seedProductOptions = createSeedProductOptions(seedProductTimeline.products);
  const seedJobs = createSeedJobs({
    now,
    products: seedProductTimeline.products,
  });

  console.info(`[db:seed] Starting seed at ${now.toISOString()}`);
  console.info(`[db:seed] Upserting ${demoUsers.length} seed user(s): ${seedUserEmails}`);

  await activeDb
    .insert(user)
    .values(
      demoUsers.map(({ departments: _departments, password: _password, ...seedUser }) => ({
        ...seedUser,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoUpdate({
      target: user.id,
      set: {
        email: sql`excluded.email`,
        emailVerified: true,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        updatedAt: now,
      },
    });

  console.info(`[db:seed] Upserted ${demoUsers.length} seed user(s)`);
  console.info(`[db:seed] Replacing ${seedUserDepartments.length} seed user department membership(s)`);

  await activeDb.transaction(async (tx) => {
    await tx.delete(userDepartment).where(inArray(userDepartment.userId, seedUserIds));

    if (seedUserDepartments.length > 0) {
      await tx.insert(userDepartment).values(seedUserDepartments);
    }
  });

  console.info(`[db:seed] Replaced ${seedUserDepartments.length} seed user department membership(s)`);
  console.info(`[db:seed] Upserting ${demoUsers.length} credential account(s)`);

  await activeDb
    .insert(account)
    .values(
      await Promise.all(
        demoUsers.map(async (seedUser) => ({
          id: `${seedUser.id}-credential-account`,
          userId: seedUser.id,
          accountId: seedUser.id,
          providerId: 'credential',
          password: await hashPassword(seedUser.password),
          createdAt: now,
          updatedAt: now,
        })),
      ),
    )
    .onConflictDoUpdate({
      target: account.id,
      set: {
        password: sql`excluded.password`,
        updatedAt: now,
      },
    });

  console.info(`[db:seed] Upserted ${demoUsers.length} credential account(s)`);
  console.info(
    `[db:seed] Upserting ${seedProductTimeline.products.length} product(s), ${seedProductOptions.length} product option(s), ${seedJobs.jobs.length} job(s), ${seedJobs.stages.length} job stage(s), and ${seedProductTimeline.auditEvents.length} audit event(s)`,
  );

  await activeDb.transaction(async (tx) => {
    await tx
      .insert(products)
      .values(seedProductTimeline.products)
      .onConflictDoUpdate({
        target: products.id,
        set: {
          basePrice: sql`excluded.base_price`,
          createdAt: sql`excluded.created_at`,
          currencyCode: sql`excluded.currency_code`,
          description: sql`excluded.description`,
          modelCode: sql`excluded.model_code`,
          name: sql`excluded.name`,
          updatedAt: sql`excluded.updated_at`,
        },
      });

    if (seedProductOptions.length > 0) {
      await tx
        .insert(productOptions)
        .values(seedProductOptions)
        .onConflictDoUpdate({
          target: productOptions.id,
          set: {
            code: sql`excluded.code`,
            createdAt: sql`excluded.created_at`,
            deletedAt: null,
            name: sql`excluded.name`,
            price: sql`excluded.price`,
            productId: sql`excluded.product_id`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    if (seedJobs.jobs.length > 0) {
      await tx
        .insert(jobs)
        .values(seedJobs.jobs)
        .onConflictDoUpdate({
          target: jobs.id,
          set: {
            createdAt: sql`excluded.created_at`,
            lifecycleStatus: sql`excluded.lifecycle_status`,
            productId: sql`excluded.product_id`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    if (seedJobs.stages.length > 0) {
      await tx
        .insert(jobStages)
        .values(seedJobs.stages)
        .onConflictDoUpdate({
          target: jobStages.id,
          set: {
            completedAt: sql`excluded.completed_at`,
            jobId: sql`excluded.job_id`,
            sequence: sql`excluded.sequence`,
            stage: sql`excluded.stage`,
            startedAt: sql`excluded.started_at`,
            status: sql`excluded.status`,
          },
        });
    }

    const seedProductIds = seedProductTimeline.products.map((product) => product.id);

    if (seedProductIds.length > 0) {
      await tx
        .delete(auditEvents)
        .where(and(eq(auditEvents.entityType, 'product'), inArray(auditEvents.entityId, seedProductIds)));
    }

    if (seedProductTimeline.auditEvents.length > 0) {
      await tx.insert(auditEvents).values(seedProductTimeline.auditEvents);
    }
  });

  console.info(
    `[db:seed] Seed complete: ${demoUsers.length} user(s), ${seedProductTimeline.products.length} product(s), ${seedProductOptions.length} product option(s), ${seedJobs.jobs.length} job(s), ${seedJobs.stages.length} job stage(s), ${seedProductTimeline.auditEvents.length} audit event(s)`,
  );
}

function createProductCreatedAt(now: Date, productIndex: number): Date {
  const ageDays = getSeedProductAgeDays(productIndex);
  const createdAt = new Date(now.getTime() - ageDays * millisecondsPerDay);

  createdAt.setUTCSeconds(0, 0);

  return createdAt;
}

function createJobCreatedAt(now: Date, jobIndex: number): Date {
  const ageDays = seedJobScenarios.length - jobIndex + JOB_STAGE_PIPELINE.length;
  const createdAt = new Date(now.getTime() - ageDays * millisecondsPerDay);

  createdAt.setUTCHours(6, (jobIndex * 9) % 60, 0, 0);

  return createdAt;
}

function createSeedJobStages({
  createdAt,
  jobId,
  jobIndex,
  scenario,
}: {
  createdAt: Date;
  jobId: string;
  jobIndex: number;
  scenario: SeedJobScenario;
}): SeedJobStage[] {
  const activeStageProgress =
    scenario.stageProgress && scenario.stageProgress !== 'complete' ? scenario.stageProgress : null;
  const currentStageIndex = activeStageProgress
    ? JOB_STAGE_PIPELINE.findIndex(({ stage }) => stage === activeStageProgress.stage)
    : -1;

  return JOB_STAGE_PIPELINE.map(({ sequence, stage }, stageIndex) => {
    const stageProgress = scenario.stageProgress;
    const isCompleted = stageProgress === 'complete' || (currentStageIndex >= 0 && stageIndex < currentStageIndex);
    const isActive = stageProgress !== null && stageProgress !== 'complete' && stageProgress.stage === stage;
    const startedAt = isCompleted || isActive ? createJobStageTimestamp(createdAt, sequence, 8, jobIndex) : null;
    const completedAt = isCompleted ? createJobStageTimestamp(createdAt, sequence, 15, jobIndex) : null;
    const status = isCompleted ? 'complete' : isActive ? stageProgress.status : 'pending';

    return {
      id: createSeedUuid('8004', jobIndex * JOB_STAGE_PIPELINE.length + sequence),
      completedAt,
      jobId,
      sequence,
      stage,
      startedAt,
      status,
    };
  });
}

function createJobStageTimestamp(createdAt: Date, sequence: number, hour: number, jobIndex: number): Date {
  const timestamp = addUtcDays(createdAt, sequence - 1);

  timestamp.setUTCHours(hour, (jobIndex * 7 + sequence * 5) % 60, 0, 0);

  return timestamp;
}

function getSeedProductAgeDays(productIndex: number): number {
  return seedProductMinAgeDays + ((productIndex * 5) % seedProductAgeDayRange);
}

function getSeedProductUpdateCount(productIndex: number, dayIndex: number): number {
  return ((productIndex + dayIndex) % 3) + 1;
}

function createProductUpdateOccurredAt({
  dayIndex,
  now,
  productIndex,
  updateDate,
  updateIndex,
  updatesForDay,
}: {
  dayIndex: number;
  now: Date;
  productIndex: number;
  updateDate: Date;
  updateIndex: number;
  updatesForDay: number;
}): Date {
  if (isSameUtcDate(updateDate, now)) {
    const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0);
    const availableMilliseconds = Math.max(updatesForDay + 1, now.getTime() - startOfToday);
    const offsetMilliseconds = Math.floor((availableMilliseconds * (updateIndex + 1)) / (updatesForDay + 1));

    return new Date(startOfToday + offsetMilliseconds);
  }

  const occurredAt = new Date(updateDate.getTime());
  const updateHours = [9, 13, 16] as const;

  occurredAt.setUTCHours(
    updateHours[updateIndex] ?? 16,
    (productIndex * 11 + dayIndex * 3 + updateIndex * 13) % 60,
    0,
    0,
  );

  return occurredAt;
}

function applySeedProductUpdate({
  dayIndex,
  product,
  productIndex,
  updateIndex,
  updateOrdinal,
}: {
  dayIndex: number;
  product: SeedTimelineProduct;
  productIndex: number;
  updateIndex: number;
  updateOrdinal: number;
}): {
  changes: SeedProductAuditChanges;
  product: SeedTimelineProduct;
} {
  const nextBasePrice = product.basePrice + 175 + productIndex * 45 + dayIndex * 12 + updateIndex * 25;
  const nextProduct: SeedTimelineProduct = {
    ...product,
    basePrice: nextBasePrice,
  };
  const changes: SeedProductAuditChanges = {
    basePrice: {
      from: product.basePrice,
      to: nextBasePrice,
    },
  };

  if ((productIndex + updateOrdinal) % 2 === 0) {
    const nextDescription = `${getBaseSeedDescription(product)} Price review ${updateOrdinal} captured for demo audit history.`;

    nextProduct.description = nextDescription;
    changes.description = {
      from: product.description,
      to: nextDescription,
    };
  }

  return {
    changes,
    product: nextProduct,
  };
}

function getBaseSeedDescription(product: SeedProduct): string {
  return product.description.split(' Price review ')[0] ?? product.description;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function isSameUtcDate(left: Date, right: Date): boolean {
  return (
    left.getUTCFullYear() === right.getUTCFullYear() &&
    left.getUTCMonth() === right.getUTCMonth() &&
    left.getUTCDate() === right.getUTCDate()
  );
}

function createSeedUuid(group: string, sequence: number): string {
  return `00000000-0000-4000-${group}-${sequence.toString(16).padStart(12, '0')}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { closeDatabaseConnection } = await import('./client.js');

  try {
    await seedDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
