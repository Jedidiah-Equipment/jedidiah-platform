import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import {
  acceptQuote,
  createCustomer,
  createJob,
  createProduct,
  createQuote,
  createStation,
  rejectQuote,
  sendQuote,
  updateProduct,
} from '@pkg/core';
import {
  account,
  closeDatabaseConnection,
  type Db,
  db,
  jobEvents,
  jobStageStations,
  jobStages,
  jobs,
  user,
  userDepartment,
} from '@pkg/db';
import { computeDefaults, createUserAccessSummary, demoUsers, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type {
  CustomerCreateInput,
  Department,
  JobCreateInput,
  JobCreateStageInput,
  JobStageName,
  JobStatus,
  Product,
  ProductCreateInput,
  ProductDepartmentConfig,
  ProductOptionUpsertInput,
  QuoteStatus,
  Station,
  UUID,
} from '@pkg/schema';
import { DateIso, DateOnlyIso, DEPARTMENTS } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { format, parseISO } from 'date-fns';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';

const seedProductCount = 10;
const seedProductMinAgeDays = 7;
const seedProductAgeDayRange = 22;
const seedStandaloneJobCount = 2;
const seedJobScheduleStartOffsetDays = -120;
const seedJobScheduleCadenceDays = 12;

const seedStations = [
  { department: 'procurement', displayOrder: 10, name: 'PO Desk' },
  { department: 'procurement', displayOrder: 20, name: 'Vendor Follow-up' },
  { department: 'supply', displayOrder: 10, name: 'Goods-In Bay' },
  { department: 'supply', displayOrder: 20, name: 'Stores Cage' },
  { department: 'fabrication', displayOrder: 10, name: 'Weld Bay 1' },
  { department: 'fabrication', displayOrder: 20, name: 'Weld Bay 2' },
  { department: 'paint', displayOrder: 10, name: 'Paint Booth A' },
  { department: 'paint', displayOrder: 20, name: 'Prep Bay' },
  { department: 'assembly', displayOrder: 10, name: 'Assembly Bench 1' },
  { department: 'assembly', displayOrder: 20, name: 'Final QA Bay' },
] as const satisfies readonly Parameters<typeof createStation>[0]['input'][];

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

const seedProductionCustomers = [
  {
    companyName: 'Kopano Quarry Operations',
    contactPerson: 'Naledi Mokoena',
    email: 'naledi.mokoena@kopanoquarry.test',
  },
  {
    companyName: 'Mkhonto Plant Hire',
    contactPerson: 'Pieter Smit',
    email: 'pieter.smit@mkhontoplant.test',
  },
  {
    companyName: 'Silver Ridge Aggregates',
    contactPerson: 'Ayesha Khan',
    email: 'ayesha.khan@silverridge.test',
  },
  {
    companyName: 'Ndlovu Civils',
    contactPerson: 'Thabo Ndlovu',
    email: 'thabo.ndlovu@ndlovucivils.test',
  },
  {
    companyName: 'Karoo Bulk Earthworks',
    contactPerson: 'Megan Jacobs',
    email: 'megan.jacobs@karoobulk.test',
  },
  {
    companyName: 'Umgeni Roadworks',
    contactPerson: 'Sizwe Zulu',
    email: 'sizwe.zulu@umgeniroadworks.test',
  },
  {
    companyName: 'Thaba Mining Supplies',
    contactPerson: 'Ruan Botha',
    email: 'ruan.botha@thabamining.test',
  },
  {
    companyName: 'Marula Contracting',
    contactPerson: 'Zanele Dube',
    email: 'zanele.dube@marulacontracting.test',
  },
  {
    companyName: 'West Coast Materials',
    contactPerson: null,
    email: null,
  },
  {
    companyName: 'Northbank Infrastructure',
    contactPerson: 'Kiran Patel',
    email: 'kiran.patel@northbank.test',
  },
  {
    companyName: 'Ironvale Construction',
    contactPerson: null,
    email: null,
  },
  {
    companyName: 'Helderberg Logistics',
    contactPerson: 'Lara Meyer',
    email: 'lara.meyer@helderberglogistics.test',
  },
] as const;

const seedJobScenarios = [
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: 'complete',
    status: 'complete',
  },
  {
    stageProgress: { stage: 'fabrication' },
    status: 'active',
  },
  {
    stageProgress: null,
  },
  {
    stageProgress: null,
  },
  {
    stageProgress: null,
  },
  {
    stageProgress: null,
  },
] as const satisfies readonly SeedJobScenario[];

const seedQuoteScenarios = [
  {
    customer: {
      companyName: 'Apex Quarry Services',
      contactPerson: 'Gareth Morgan',
      email: 'gareth.morgan@apexquarry.test',
    },
    discount: 7_500,
    notes: 'Initial budgetary quote for the north pit loader replacement.',
    status: 'draft',
    validUntil: '2026-06-15',
  },
  {
    customer: {
      companyName: 'Blue Ridge Plant Hire',
      contactPerson: 'Lindiwe Mthembu',
      email: 'lindiwe.mthembu@blueridgeplant.test',
    },
    discount: 12_000,
    notes: 'Sent after procurement confirmed availability.',
    status: 'sent',
    validUntil: '2026-06-22',
  },
  {
    customer: {
      companyName: 'Copperline Civils',
      contactPerson: 'Hendrik le Roux',
      email: 'hendrik.leroux@copperlinecivils.test',
    },
    discount: 0,
    notes: 'Accepted by operations lead; waiting for production scheduling.',
    status: 'accepted',
    validUntil: '2026-07-01',
  },
  {
    customer: {
      companyName: 'Delta Aggregate Works',
      contactPerson: null,
      email: null,
    },
    discount: 18_500,
    notes: 'Accepted and used to create a production job.',
    status: 'accepted-with-job',
    validUntil: '2026-07-08',
  },
  {
    customer: {
      companyName: 'Eagle Bulk Earthworks',
      contactPerson: 'Farah Daniels',
      email: 'farah.daniels@eaglebulk.test',
    },
    discount: 10_000,
    notes: 'Rejected after customer chose a rental option.',
    status: 'rejected',
    validUntil: '2026-06-28',
  },
] as const satisfies readonly SeedQuoteScenario[];

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
  status?: JobStatus;
  stageProgress: { stage: JobStageName } | 'complete' | null;
};

type SeedProductPlan = {
  initial: SeedProduct;
  updates: SeedProductUpdate[];
};

type SeedProductUpdate = Pick<SeedProduct, 'basePrice' | 'description'>;

type SeededProduct = Pick<Product, 'departmentConfigs' | 'id' | 'options'>;

type SeedCustomer = Pick<CustomerCreateInput, 'companyName' | 'contactPerson' | 'email'>;

type SeedStationCatalog = Record<Department, Station[]>;

type SeedQuoteScenario = {
  customer: SeedCustomer;
  discount: number;
  notes: string;
  status: QuoteStatus | 'accepted-with-job';
  validUntil: string;
};

export function createSeedProducts(stationCatalog: SeedStationCatalog, count = seedProductCount): SeedProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const family = equipmentFamilies[index % equipmentFamilies.length] ?? equipmentFamilies[0];
    const series = equipmentSeries[index % equipmentSeries.length] ?? equipmentSeries[0];
    const sequence = index + 1;

    return {
      basePrice: 125_000 + sequence * 18_750,
      currencyCode: 'ZAR',
      departmentConfigs: createSeedDepartmentConfigs({
        productIndex: index,
        stationCatalog,
      }),
      description: `${series} ${family.toLowerCase()} configured for regional equipment inventory.`,
      modelCode: `JED-${family
        .split(' ')
        .map((part) => part[0])
        .join('')}-${String(sequence).padStart(3, '0')}`,
      name: `${series} ${family} ${String(sequence).padStart(3, '0')}`,
      options: createSeedProductOptions(index),
    };
  });
}

function createSeedDepartmentConfigs({
  productIndex,
  stationCatalog,
}: {
  productIndex: number;
  stationCatalog: SeedStationCatalog;
}): ProductDepartmentConfig[] {
  const fabricationStations = getSeedStations(stationCatalog, 'fabrication', 2);
  const assemblyStations = getSeedStations(stationCatalog, 'assembly', 2);
  const supplyStations = getSeedStations(stationCatalog, 'supply', 2);
  const paintStations = getSeedStations(stationCatalog, 'paint', 2);

  return DEPARTMENTS.map((department: Department) => ({
    defaultStationIds: getSeedDefaultStationIds({
      assemblyStations,
      department,
      fabricationStations,
      paintStations,
      productIndex,
      stationCatalog,
      supplyStations,
    }),
    department,
    durationDays: getSeedDepartmentDurationDays({ department, productIndex }),
  }));
}

function getSeedDepartmentDurationDays({
  department,
  productIndex,
}: {
  department: Department;
  productIndex: number;
}): number {
  const isHeavyBuild = productIndex % 3 === 0;
  const baseDurations = {
    assembly: isHeavyBuild ? 4 : 3,
    fabrication: isHeavyBuild ? 5 : 3,
    paint: 2,
    procurement: productIndex % 2 === 0 ? 2 : 1,
    supply: 1,
  } as const satisfies Record<Department, number>;

  return baseDurations[department];
}

function getSeedDefaultStationIds({
  assemblyStations,
  department,
  fabricationStations,
  paintStations,
  productIndex,
  stationCatalog,
  supplyStations,
}: {
  assemblyStations: Station[];
  department: Department;
  fabricationStations: Station[];
  paintStations: Station[];
  productIndex: number;
  stationCatalog: SeedStationCatalog;
  supplyStations: Station[];
}): UUID[] {
  switch (department) {
    case 'assembly':
      return productIndex % 2 === 0
        ? [getSeedStationAt(assemblyStations, 0).id, getSeedStationAt(assemblyStations, 1).id]
        : [getSeedStationAt(assemblyStations, 0).id];
    case 'fabrication':
      return productIndex % 4 === 0
        ? [getSeedStationAt(fabricationStations, 0).id, getSeedStationAt(fabricationStations, 1).id]
        : [getSeedStationAt(fabricationStations, 0).id];
    case 'paint':
      return productIndex % 3 === 0
        ? [getSeedStationAt(paintStations, 0).id, getSeedStationAt(paintStations, 1).id]
        : [getSeedStationAt(paintStations, 0).id];
    case 'procurement':
      return [getSeedStationAt(getSeedStations(stationCatalog, 'procurement', 1), 0).id];
    case 'supply':
      return [getSeedStationAt(supplyStations, productIndex % supplyStations.length).id];
  }
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
  const seedDate = fromSeedIsoDate(toSeedIsoDate(now));
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

  const stationCatalog = await seedStationsWithCore({
    actorUserId: 'seed-job-supervisor-user',
    db: activeDb,
  });
  const seedProductPlans = createSeedProductPlans(createSeedProducts(stationCatalog));

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
    seedDate,
  });

  await seedQuotesWithCore({
    db: activeDb,
    products: seededProducts,
    seedDate,
  });

  console.info(
    `[db:seed] Seed complete: ${demoUsers.length} user(s), ${seedStations.length} station(s), ${seededProducts.length} product scenario(s), ${seedJobScenarios.length} job scenario(s) (${seedJobScenarios.length - seedStandaloneJobCount} quote-backed), and ${seedQuoteScenarios.length} standalone quote scenario(s)`,
  );
}

async function seedStationsWithCore({ actorUserId, db }: { actorUserId: string; db: Db }): Promise<SeedStationCatalog> {
  console.info(`[db:seed] Creating ${seedStations.length} station catalog row(s)`);
  const catalog = createEmptySeedStationCatalog();

  for (const input of seedStations) {
    const station = await createStation({
      actorUserId,
      db,
      input,
    });

    catalog[station.department].push(station);
  }

  return catalog;
}

function createEmptySeedStationCatalog(): SeedStationCatalog {
  return {
    assembly: [],
    fabrication: [],
    paint: [],
    procurement: [],
    supply: [],
  };
}

function getSeedStations(catalog: SeedStationCatalog, department: Department, minimumCount: number): Station[] {
  const stations = catalog[department];

  if (stations.length < minimumCount) {
    throw new Error(
      `Seed station catalog for ${department} requires at least ${minimumCount} station(s); found ${stations.length}`,
    );
  }

  return stations;
}

function getSeedStationAt(stations: readonly Station[], index: number): Station {
  const station = stations[index];

  if (!station) {
    throw new Error(`Seed station lookup failed for index ${index}`);
  }

  return station;
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
          departmentConfigs: product.departmentConfigs,
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

async function seedJobsWithCore({
  db,
  products,
  seedDate,
}: {
  db: Db;
  products: readonly Product[];
  seedDate: Date;
}): Promise<void> {
  if (products.length === 0) {
    return;
  }

  const actorUserId = 'seed-job-supervisor-user';
  const salesUserId = 'seed-sales-user';
  const access = createUserAccessSummary({
    role: 'job-supervisor',
    userId: actorUserId,
  });

  for (const [scenarioIndex, scenario] of seedJobScenarios.entries()) {
    const product = products[scenarioIndex % products.length];

    if (!product) {
      throw new Error('Seed job product lookup failed');
    }

    const created =
      scenarioIndex < seedStandaloneJobCount
        ? await createJob({
            access,
            actorUserId,
            db,
            input: createSeedJobInput({ product, scenario, scenarioIndex, seedDate }),
          })
        : await createQuoteBackedSeedJob({
            access,
            actorUserId,
            db,
            product,
            salesUserId,
            scenario,
            scenarioIndex,
            seedDate,
          });

    await applySeedJobScenario({
      db,
      id: created.id,
      scenario,
    });

    await applySeedJobTimeline({
      actorUserId,
      db,
      id: created.id,
      scenario,
      scenarioIndex,
      seedDate,
    });
  }
}

async function createQuoteBackedSeedJob({
  access,
  actorUserId,
  db,
  product,
  salesUserId,
  scenario,
  scenarioIndex,
  seedDate,
}: {
  access: ReturnType<typeof createUserAccessSummary>;
  actorUserId: string;
  db: Db;
  product: Product;
  salesUserId: string;
  scenario: SeedJobScenario;
  scenarioIndex: number;
  seedDate: Date;
}) {
  const customer = await createCustomer({
    actorUserId: salesUserId,
    db,
    input: createSeedCustomerInput(getSeedProductionCustomer(scenarioIndex)),
  });
  const quote = await createQuote({
    actorUserId: salesUserId,
    db,
    input: {
      customer: {
        type: 'existing',
        customerId: customer.id,
      },
      discount: getSeedJobQuoteDiscount(scenarioIndex),
      notes: 'Accepted seed quote used to create a production job.',
      productId: product.id,
      salesPersonId: salesUserId,
      validUntil: DateIso.parse(getSeedJobQuoteValidUntil(scenarioIndex)),
    },
  });
  const sent = await sendQuote({ actorUserId: salesUserId, db, input: { id: quote.id } });
  const accepted = await acceptQuote({ actorUserId: salesUserId, db, input: { id: sent.id } });

  return createJob({
    access,
    actorUserId,
    db,
    input: createSeedJobInput({
      product,
      quoteId: accepted.id,
      scenario,
      scenarioIndex,
      seedDate,
    }),
  });
}

function createSeedJobInput({
  product,
  quoteId = null,
  scenario,
  scenarioIndex = 0,
  seedDate,
}: {
  product: Product;
  quoteId?: UUID | null;
  scenario?: SeedJobScenario;
  scenarioIndex?: number;
  seedDate?: Date;
}): JobCreateInput {
  const plannedStart =
    scenario && seedDate
      ? getSeedJobPlannedStartDate({ scenarioIndex, seedDate })
      : getFallbackSeedJobPlannedStartDate(scenarioIndex);
  const defaultStages = computeDefaults({
    anchor: {
      kind: 'start',
      value: fromSeedIsoDate(plannedStart),
    },
    productPerDeptConfig: product.departmentConfigs.map((config) => ({
      defaultStationIds: config.defaultStationIds,
      durationDays: config.durationDays,
      stage: config.department,
    })),
  });
  const firstStage = defaultStages.stages[0];
  const lastStage = defaultStages.stages[defaultStages.stages.length - 1];

  if (!firstStage || !lastStage) {
    throw new Error('Seed job defaults did not produce the five-stage pipeline');
  }

  return {
    dueDate: DateOnlyIso.parse(toSeedIsoDate(lastStage.plannedEnd)),
    productId: product.id,
    quoteId,
    stages: defaultStages.stages.map(
      (stage): JobCreateStageInput => ({
        stage: stage.stage,
        stationBookings: defaultStages.stationBookings
          .filter((booking) => booking.stage === stage.stage)
          .map((booking) => ({
            plannedEnd: DateOnlyIso.parse(toSeedIsoDate(booking.plannedEnd)),
            plannedStart: DateOnlyIso.parse(toSeedIsoDate(booking.plannedStart)),
            stationId: booking.stationId,
          })),
      }),
    ),
  };
}

async function applySeedJobTimeline({
  actorUserId,
  db,
  id,
  scenario,
  scenarioIndex,
  seedDate,
}: {
  actorUserId: string;
  db: Db;
  id: UUID;
  scenario: SeedJobScenario;
  scenarioIndex: number;
  seedDate: Date;
}): Promise<void> {
  if (!scenario.stageProgress) {
    return;
  }

  const stageRows = await db
    .select({
      id: jobStages.id,
      plannedEnd: jobStageStations.plannedEnd,
      plannedStart: jobStageStations.plannedStart,
      sequence: jobStages.sequence,
      stage: jobStages.stage,
    })
    .from(jobStages)
    .innerJoin(jobStageStations, eq(jobStageStations.jobStageId, jobStages.id))
    .where(eq(jobStages.jobId, id))
    .orderBy(asc(jobStages.sequence), asc(jobStageStations.id));
  const stageWindows = getSeedStageWindows(stageRows);

  const activeStageProgress = scenario.stageProgress !== 'complete' ? scenario.stageProgress : null;
  const currentStageIndex = activeStageProgress
    ? JOB_STAGE_PIPELINE.findIndex(({ stage }) => stage === activeStageProgress.stage)
    : -1;
  const completedStageCount =
    scenario.stageProgress === 'complete' ? JOB_STAGE_PIPELINE.length : Math.max(currentStageIndex, 0);
  const completedJobEnd =
    scenario.stageProgress === 'complete'
      ? getSeedActualDate({
          boundary: 'end',
          plannedDate: stageWindows.at(-1)?.plannedEnd ?? seedDate,
          scenarioIndex,
          stageIndex: stageWindows.length - 1,
        })
      : null;

  for (const [stageIndex, stage] of stageWindows.entries()) {
    const isCompletedStage = stageIndex < completedStageCount;
    const isActiveStage = activeStageProgress?.stage === stage.stage;
    const actualStart =
      isCompletedStage || isActiveStage
        ? getSeedActualDate({
            boundary: 'start',
            plannedDate: stage.plannedStart,
            scenarioIndex,
            stageIndex,
          })
        : null;
    const actualEnd = isCompletedStage
      ? stageIndex === stageWindows.length - 1 && completedJobEnd
        ? completedJobEnd
        : getSeedActualDate({
            boundary: 'end',
            plannedDate: stage.plannedEnd,
            scenarioIndex,
            stageIndex,
          })
      : null;

    await db
      .update(jobStageStations)
      .set({
        actualEnd,
        actualStart,
        updatedAt: actualEnd ?? actualStart ?? new Date(),
      })
      .where(eq(jobStageStations.jobStageId, stage.id));

    if (actualStart) {
      await updateSeedStageWorkflowEvent({
        actualField: 'actualStart',
        actorUserId,
        db,
        eventType: 'stage.started',
        jobId: id,
        stage: stage.stage,
        timestamp: actualStart,
      });
    }

    if (actualEnd) {
      await updateSeedStageWorkflowEvent({
        actualField: 'actualEnd',
        actorUserId,
        db,
        eventType: 'stage.stopped',
        jobId: id,
        stage: stage.stage,
        timestamp: actualEnd,
      });
    }
  }

  if (completedJobEnd) {
    await db
      .update(jobEvents)
      .set({ actorUserId, occurredAt: completedJobEnd })
      .where(and(eq(jobEvents.jobId, id), eq(jobEvents.eventType, 'job.completed')));
  }
}

function getSeedStageWindows(
  rows: readonly {
    id: UUID;
    plannedEnd: string | null;
    plannedStart: string | null;
    sequence: number;
    stage: JobStageName;
  }[],
): {
  id: UUID;
  plannedEnd: Date;
  plannedStart: Date;
  sequence: number;
  stage: JobStageName;
}[] {
  const stageWindowsById = new Map<
    UUID,
    {
      id: UUID;
      plannedEnd: Date;
      plannedStart: Date;
      sequence: number;
      stage: JobStageName;
    }
  >();

  for (const row of rows) {
    if (!row.plannedStart || !row.plannedEnd) {
      throw new Error(`Seed job stage ${row.stage} is missing a planned schedule`);
    }

    if (!stageWindowsById.has(row.id)) {
      stageWindowsById.set(row.id, {
        id: row.id,
        plannedEnd: fromSeedIsoDate(row.plannedEnd),
        plannedStart: fromSeedIsoDate(row.plannedStart),
        sequence: row.sequence,
        stage: row.stage,
      });
    }
  }

  return Array.from(stageWindowsById.values()).sort((left, right) => left.sequence - right.sequence);
}

async function updateSeedStageWorkflowEvent({
  actualField,
  actorUserId,
  db,
  eventType,
  jobId,
  stage,
  timestamp,
}: {
  actualField: 'actualEnd' | 'actualStart';
  actorUserId: string;
  db: Db;
  eventType: 'stage.started' | 'stage.stopped';
  jobId: UUID;
  stage: JobStageName;
  timestamp: Date;
}): Promise<void> {
  await db
    .update(jobEvents)
    .set({
      actorUserId,
      occurredAt: timestamp,
      payload: sql`jsonb_set(${jobEvents.payload}, ${`{${actualField}}`}, to_jsonb(${timestamp.toISOString()}::text), true)`,
    })
    .where(
      and(
        eq(jobEvents.jobId, jobId),
        eq(jobEvents.eventType, eventType),
        sql`${jobEvents.payload}->>'stage' = ${stage}`,
      ),
    );
}

async function seedQuotesWithCore({
  db,
  products,
  seedDate,
}: {
  db: Db;
  products: readonly Product[];
  seedDate: Date;
}): Promise<void> {
  if (products.length === 0) {
    return;
  }

  const actorUserId = 'seed-sales-user';
  const supervisorUserId = 'seed-job-supervisor-user';
  let acceptedWithJobCount = 0;
  const supervisorAccess = createUserAccessSummary({
    role: 'job-supervisor',
    userId: supervisorUserId,
  });

  for (const [scenarioIndex, scenario] of seedQuoteScenarios.entries()) {
    const product = products[(scenarioIndex + 2) % products.length];

    if (!product) {
      throw new Error('Seed quote product lookup failed');
    }

    const customer = await createCustomer({
      actorUserId,
      db,
      input: createSeedCustomerInput(scenario.customer),
    });
    const quote = await createQuote({
      actorUserId,
      db,
      input: {
        customer: {
          type: 'existing',
          customerId: customer.id,
        },
        discount: scenario.discount,
        notes: scenario.notes,
        productId: product.id,
        salesPersonId: actorUserId,
        validUntil: DateIso.parse(scenario.validUntil),
      },
    });

    if (scenario.status === 'draft') {
      continue;
    }

    const sent = await sendQuote({ actorUserId, db, input: { id: quote.id } });

    if (scenario.status === 'sent') {
      continue;
    }

    if (scenario.status === 'rejected') {
      await rejectQuote({ actorUserId, db, input: { id: sent.id } });
      continue;
    }

    const accepted = await acceptQuote({ actorUserId, db, input: { id: sent.id } });

    if (scenario.status === 'accepted-with-job') {
      const acceptedJobScenarioIndex = seedJobScenarios.length + acceptedWithJobCount;
      acceptedWithJobCount += 1;

      await createJob({
        access: supervisorAccess,
        actorUserId: supervisorUserId,
        db,
        input: createSeedJobInput({
          product,
          quoteId: accepted.id,
          scenario: {
            stageProgress: null,
          },
          scenarioIndex: acceptedJobScenarioIndex,
          seedDate,
        }),
      });
    }
  }
}

async function applySeedJobScenario({
  db,
  id,
  scenario,
}: {
  db: Db;
  id: UUID;
  scenario: SeedJobScenario;
}): Promise<void> {
  if (scenario.status) {
    await db.update(jobs).set({ status: scenario.status, updatedAt: new Date() }).where(eq(jobs.id, id));
  }
}

function getSeedProductAgeDays(productIndex: number): number {
  return seedProductMinAgeDays + ((productIndex * 5) % seedProductAgeDayRange);
}

function getSeedJobPlannedStartDate({ scenarioIndex, seedDate }: { scenarioIndex: number; seedDate: Date }): string {
  return toSeedIsoDate(
    addSeedDays(seedDate, seedJobScheduleStartOffsetDays + scenarioIndex * seedJobScheduleCadenceDays),
  );
}

function getFallbackSeedJobPlannedStartDate(scenarioIndex: number): string {
  return getSeedIsoDate({
    dayOffset: 23 + scenarioIndex * seedJobScheduleCadenceDays,
    month: 1,
    year: 2026,
  });
}

function getSeedActualDate({
  boundary,
  plannedDate,
  scenarioIndex,
  stageIndex,
}: {
  boundary: 'end' | 'start';
  plannedDate: Date;
  scenarioIndex: number;
  stageIndex: number;
}): Date {
  const variance = getSeedActualVarianceDays({ boundary, scenarioIndex, stageIndex });

  return addSeedDays(plannedDate, variance);
}

function getSeedActualVarianceDays({
  boundary,
  scenarioIndex,
  stageIndex,
}: {
  boundary: 'end' | 'start';
  scenarioIndex: number;
  stageIndex: number;
}): number {
  const varianceSeed = scenarioIndex * 5 + stageIndex * 3 + (boundary === 'end' ? 1 : 0);

  if (varianceSeed % 11 === 0) {
    return -1;
  }

  if (varianceSeed % 7 === 0) {
    return 1;
  }

  return 0;
}

function getSeedJobQuoteValidUntil(scenarioIndex: number): string {
  return getSeedIsoDate({
    dayOffset: 14 + scenarioIndex * 2,
    month: 5,
    year: 2026,
  });
}

function getSeedJobQuoteDiscount(scenarioIndex: number): number {
  return scenarioIndex % 3 === 0 ? 8_500 : 3_000 + scenarioIndex * 750;
}

function getSeedProductionCustomer(scenarioIndex: number): SeedCustomer {
  const customer = seedProductionCustomers[(scenarioIndex - seedStandaloneJobCount) % seedProductionCustomers.length];

  if (!customer) {
    throw new Error('Seed production customer lookup failed');
  }

  return customer;
}

function createSeedCustomerInput(customer: SeedCustomer): CustomerCreateInput {
  return {
    address: null,
    companyName: customer.companyName,
    contactPerson: customer.contactPerson,
    email: customer.email,
    notes: null,
    phone: null,
  };
}

function getSeedIsoDate({ dayOffset, month, year }: { dayOffset: number; month: number; year: number }): string {
  const date = new Date(Date.UTC(year, month, dayOffset));

  return format(date, 'yyyy-MM-dd');
}

function fromSeedIsoDate(value: string): Date {
  return parseISO(`${value}T00:00:00.000Z`);
}

function toSeedIsoDate(value: Date): string {
  return format(value, 'yyyy-MM-dd');
}

function addSeedDays(value: Date, dayOffset: number): Date {
  const next = new Date(value);

  next.setUTCDate(next.getUTCDate() + dayOffset);

  return next;
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
    const nextDescription = `${getBaseSeedDescription(product)} Price review ${updateOrdinal} captured after supplier review.`;

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
