import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import {
  cancelJob,
  completeJobStage,
  createJob,
  createProduct,
  pauseJob,
  resumeJob,
  setJobStageStatus,
  startJobStage,
  updateProduct,
} from '@pkg/core';
import { account, closeDatabaseConnection, type Db, db, user, userDepartment } from '@pkg/db';
import { createUserAccessSummary, demoUsers, JOB_STAGE_PIPELINE } from '@pkg/domain';
import {
  type JobStageName,
  type JobStageStatus,
  JobStageStatusInput,
  type Product,
  type ProductCreateInput,
  type ProductOptionUpsertInput,
  type UUID,
} from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { inArray, sql } from 'drizzle-orm';

const seedProductCount = 10;
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
    stageProgress: null,
  },
  {
    stageProgress: { stage: 'procurement', status: 'ordering' },
  },
  {
    stageProgress: { stage: 'procurement', status: 'partial' },
  },
  {
    stageProgress: { stage: 'fabrication', status: 'cutting' },
  },
  {
    stageProgress: { stage: 'fabrication', status: 'welding' },
  },
  {
    stageProgress: { stage: 'assembly', status: 'in-progress' },
  },
  {
    stageProgress: { stage: 'assembly', status: 'qc' },
  },
  {
    stageProgress: { stage: 'paint', status: 'prep' },
  },
  {
    stageProgress: { stage: 'paint', status: 'painting' },
  },
  {
    stageProgress: { stage: 'paint', status: 'curing' },
    lifecycleTransitions: ['cancel'],
  },
  {
    stageProgress: { stage: 'dispatch', status: 'ready' },
  },
  {
    stageProgress: 'complete',
  },
  {
    stageProgress: { stage: 'assembly', status: 'in-progress' },
    lifecycleTransitions: ['pause'],
  },
  {
    stageProgress: { stage: 'fabrication', status: 'qc' },
    lifecycleTransitions: ['pause', 'resume'],
  },
] as const satisfies readonly SeedJobScenario[];

const seedStageStatusProgression = {
  assembly: ['in-progress', 'qc'],
  dispatch: ['ready', 'dispatched'],
  fabrication: ['cutting', 'welding', 'qc'],
  paint: ['prep', 'painting', 'curing'],
  procurement: ['ordering', 'partial'],
} as const satisfies Record<JobStageName, readonly JobStageStatus[]>;

type SeedProduct = ProductCreateInput & {
  name: string;
  modelCode: string;
  basePrice: number;
  currencyCode: string;
  description: string;
};

type SeedProductOption = ProductCreateInput['options'][number] & {
  name: string;
  code: string;
  price: number;
};

type SeedJobScenario = {
  lifecycleTransitions?: readonly SeedJobLifecycleTransition[];
  stageProgress: { stage: JobStageName; status: JobStageStatus } | 'complete' | null;
};

type SeedJobLifecycleTransition = 'pause' | 'resume' | 'cancel';

type SeedProductPlan = {
  initial: SeedProduct;
  updates: SeedProductUpdate[];
};

type SeedProductUpdate = Pick<SeedProduct, 'basePrice' | 'description'>;

type SeededProduct = Pick<Product, 'id' | 'options'>;

export function createSeedProducts(count = seedProductCount): SeedProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const family = equipmentFamilies[index % equipmentFamilies.length] ?? equipmentFamilies[0];
    const series = equipmentSeries[index % equipmentSeries.length] ?? equipmentSeries[0];
    const sequence = index + 1;

    return {
      basePrice: 125_000 + sequence * 18_750,
      currencyCode: 'ZAR',
      description: `${series} ${family.toLowerCase()} configured for local demo inventory.`,
      modelCode: `JED-${family
        .split(' ')
        .map((part) => part[0])
        .join('')}-${String(sequence).padStart(3, '0')}`,
      name: `${series} ${family} ${String(sequence).padStart(3, '0')}`,
      options: createSeedProductOptions(index),
    };
  });
}

function createSeedProductOptions(productIndex: number): SeedProductOption[] {
  const sequence = productIndex + 1;

  return [
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
  ];
}

function createSeedProductPlans(productsToSeed: readonly SeedProduct[]): SeedProductPlan[] {
  return productsToSeed.map((seedProduct, productIndex) => {
    let currentProduct = seedProduct;
    let updateOrdinal = 0;
    const updates: SeedProductUpdate[] = [];

    const ageDays = getSeedProductAgeDays(productIndex);

    for (let dayIndex = 1; dayIndex <= ageDays; dayIndex += 1) {
      const updatesForDay = getSeedProductUpdateCount(productIndex, dayIndex);

      for (let updateIndex = 0; updateIndex < updatesForDay; updateIndex += 1) {
        updateOrdinal += 1;
        const product = applySeedProductUpdate({
          dayIndex,
          product: currentProduct,
          productIndex,
          updateIndex,
          updateOrdinal,
        });

        currentProduct = product;
        updates.push({
          basePrice: product.basePrice,
          description: product.description,
        });
      }
    }

    return {
      initial: seedProduct,
      updates,
    };
  });
}

export async function seedDatabase(database?: Db): Promise<void> {
  // This seeder is intentionally not idempotent; use pnpm db:reset before running it.
  const activeDb = database ?? db;
  const now = new Date();
  const seedProductPlans = createSeedProductPlans(createSeedProducts());
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
  console.info(`[db:seed] Rebuilding ${seedProductPlans.length} product scenario(s) through core services`);

  const seededProducts = await seedProductsWithCore({
    actorUserIds: productEditorUserIds,
    db: activeDb,
    plans: seedProductPlans,
  });

  await seedJobsWithCore({
    db: activeDb,
    products: seededProducts,
  });

  console.info(
    `[db:seed] Seed complete: ${demoUsers.length} user(s), ${seededProducts.length} product scenario(s), and ${seedJobScenarios.length} job scenario(s)`,
  );
}

async function seedProductsWithCore({
  actorUserIds,
  db,
  plans,
}: {
  actorUserIds: readonly string[];
  db: Db;
  plans: readonly SeedProductPlan[];
}): Promise<Product[]> {
  const seededProducts: Product[] = [];

  for (const [planIndex, plan] of plans.entries()) {
    const actorUserId = actorUserIds[planIndex % actorUserIds.length];

    if (!actorUserId) {
      throw new Error('At least one product-editor seed user is required to seed products');
    }

    let product = await createProduct({
      actorUserId,
      db,
      input: plan.initial,
    });

    for (const update of plan.updates) {
      product = await updateProduct({
        actorUserId,
        db,
        input: {
          id: product.id,
          basePrice: update.basePrice,
          currencyCode: product.currencyCode,
          description: update.description,
          modelCode: product.modelCode,
          name: product.name,
          options: mapExistingProductOptionsForUpdate(product),
        },
      });
    }

    seededProducts.push(product);
  }

  return seededProducts;
}

function mapExistingProductOptionsForUpdate(product: SeededProduct): ProductOptionUpsertInput[] {
  return product.options.map((option) => ({
    code: option.code,
    id: option.id,
    name: option.name,
    price: option.price,
  }));
}

async function seedJobsWithCore({ db, products }: { db: Db; products: readonly Product[] }): Promise<void> {
  if (products.length === 0) {
    return;
  }

  const actorUserId = 'seed-job-supervisor-user';
  const access = createUserAccessSummary({
    role: 'job-supervisor',
    userId: actorUserId,
  });

  for (const [scenarioIndex, scenario] of seedJobScenarios.entries()) {
    const product = products[scenarioIndex % products.length];

    if (!product) {
      throw new Error('Seed job product lookup failed');
    }

    const created = await createJob({
      access,
      actorUserId,
      db,
      input: {
        productId: product.id,
      },
    });

    await applySeedJobScenario({
      access,
      actorUserId,
      db,
      id: created.id,
      scenario,
    });
  }
}

async function applySeedJobScenario({
  access,
  actorUserId,
  db,
  id,
  scenario,
}: {
  access: ReturnType<typeof createUserAccessSummary>;
  actorUserId: string;
  db: Db;
  id: UUID;
  scenario: SeedJobScenario;
}): Promise<void> {
  const activeStageProgress =
    scenario.stageProgress && scenario.stageProgress !== 'complete' ? scenario.stageProgress : null;
  const currentStageIndex = activeStageProgress
    ? JOB_STAGE_PIPELINE.findIndex(({ stage }) => stage === activeStageProgress.stage)
    : -1;
  const completedStageCount =
    scenario.stageProgress === 'complete' ? JOB_STAGE_PIPELINE.length : Math.max(currentStageIndex, 0);

  for (const { stage } of JOB_STAGE_PIPELINE.slice(0, completedStageCount)) {
    await startJobStage({ access, actorUserId, db, id, stage });
    await advanceStageStatuses({ access, actorUserId, db, id, stage });
    await completeJobStage({ access, actorUserId, db, id, stage });
  }

  if (activeStageProgress) {
    await startJobStage({ access, actorUserId, db, id, stage: activeStageProgress.stage });
    await advanceStageStatuses({
      access,
      actorUserId,
      db,
      id,
      stage: activeStageProgress.stage,
      targetStatus: activeStageProgress.status,
    });
  }

  await applySeedJobLifecycleTransitions({
    access,
    actorUserId,
    db,
    id,
    transitions: scenario.lifecycleTransitions ?? [],
  });
}

async function applySeedJobLifecycleTransitions({
  access,
  actorUserId,
  db,
  id,
  transitions,
}: {
  access: ReturnType<typeof createUserAccessSummary>;
  actorUserId: string;
  db: Db;
  id: UUID;
  transitions: readonly SeedJobLifecycleTransition[];
}): Promise<void> {
  for (const transition of transitions) {
    if (transition === 'pause') {
      await pauseJob({ access, actorUserId, db, id });
      continue;
    }

    if (transition === 'resume') {
      await resumeJob({ access, actorUserId, db, id });
      continue;
    }

    await cancelJob({ access, actorUserId, db, id });
  }
}

async function advanceStageStatuses({
  access,
  actorUserId,
  db,
  id,
  stage,
  targetStatus = 'complete',
}: {
  access: ReturnType<typeof createUserAccessSummary>;
  actorUserId: string;
  db: Db;
  id: UUID;
  stage: JobStageName;
  targetStatus?: JobStageStatus;
}): Promise<void> {
  for (const status of seedStageStatusProgression[stage]) {
    if (targetStatus === 'pending') {
      return;
    }

    await setJobStageStatus({
      access,
      actorUserId,
      db,
      input: JobStageStatusInput.parse({
        id,
        stage,
        status,
      }),
    });

    if (status === targetStatus) {
      return;
    }
  }
}

function getSeedProductAgeDays(productIndex: number): number {
  return seedProductMinAgeDays + ((productIndex * 5) % seedProductAgeDayRange);
}

function getSeedProductUpdateCount(productIndex: number, dayIndex: number): number {
  return ((productIndex + dayIndex) % 3) + 1;
}

function applySeedProductUpdate({
  dayIndex,
  product,
  productIndex,
  updateIndex,
  updateOrdinal,
}: {
  dayIndex: number;
  product: SeedProduct;
  productIndex: number;
  updateIndex: number;
  updateOrdinal: number;
}): SeedProduct {
  const nextBasePrice = product.basePrice + 175 + productIndex * 45 + dayIndex * 12 + updateIndex * 25;
  const nextProduct: SeedProduct = {
    ...product,
    basePrice: nextBasePrice,
  };

  if ((productIndex + updateOrdinal) % 2 === 0) {
    const nextDescription = `${getBaseSeedDescription(product)} Price review ${updateOrdinal} captured for demo audit history.`;

    nextProduct.description = nextDescription;
  }

  return nextProduct;
}

function getBaseSeedDescription(product: SeedProduct): string {
  return product.description.split(' Price review ')[0] ?? product.description;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await seedDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
