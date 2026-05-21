import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import {
  acceptQuote,
  cancelJob,
  completeJobStage,
  createCustomer,
  createJob,
  createJobFromQuote,
  createProduct,
  createQuote,
  createStation,
  pauseJob,
  rejectQuote,
  resumeJob,
  sendQuote,
  startJobStage,
  updateProduct,
} from '@pkg/core';
import { account, closeDatabaseConnection, type Db, db, user, userDepartment } from '@pkg/db';
import { createUserAccessSummary, demoUsers, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type {
  CustomerCreateInput,
  Department,
  JobStageName,
  Product,
  ProductCreateInput,
  ProductDepartmentConfig,
  ProductOptionUpsertInput,
  QuoteStatus,
  UUID,
} from '@pkg/schema';
import { DEPARTMENTS } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { inArray, sql } from 'drizzle-orm';

const seedProductCount = 10;
const seedProductMinAgeDays = 7;
const seedProductAgeDayRange = 22;
const seedStandaloneJobCount = 2;

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
    stageProgress: null,
  },
  {
    stageProgress: { stage: 'procurement' },
  },
  {
    stageProgress: { stage: 'procurement' },
  },
  {
    stageProgress: { stage: 'fabrication' },
  },
  {
    stageProgress: { stage: 'fabrication' },
  },
  {
    stageProgress: { stage: 'assembly' },
  },
  {
    stageProgress: { stage: 'assembly' },
  },
  {
    stageProgress: { stage: 'paint' },
  },
  {
    stageProgress: { stage: 'paint' },
  },
  {
    stageProgress: { stage: 'paint' },
    lifecycleTransitions: ['cancel'],
  },
  {
    stageProgress: { stage: 'supply' },
  },
  {
    stageProgress: 'complete',
  },
  {
    stageProgress: { stage: 'assembly' },
    lifecycleTransitions: ['pause'],
  },
  {
    stageProgress: { stage: 'fabrication' },
    lifecycleTransitions: ['pause', 'resume'],
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
    notes: 'Accepted and converted to a production job.',
    status: 'accepted-converted',
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
  lifecycleTransitions?: readonly SeedJobLifecycleTransition[];
  stageProgress: { stage: JobStageName } | 'complete' | null;
};

type SeedJobLifecycleTransition = 'pause' | 'resume' | 'cancel';

type SeedProductPlan = {
  initial: SeedProduct;
  updates: SeedProductUpdate[];
};

type SeedProductUpdate = Pick<SeedProduct, 'basePrice' | 'description'>;

type SeededProduct = Pick<Product, 'departmentConfigs' | 'id' | 'options'>;

type SeedCustomer = Pick<CustomerCreateInput, 'companyName' | 'contactPerson' | 'email'>;

type SeedQuoteScenario = {
  customer: SeedCustomer;
  discount: number;
  notes: string;
  status: QuoteStatus | 'accepted-converted';
  validUntil: string;
};

export function createSeedProducts(count = seedProductCount): SeedProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const family = equipmentFamilies[index % equipmentFamilies.length] ?? equipmentFamilies[0];
    const series = equipmentSeries[index % equipmentSeries.length] ?? equipmentSeries[0];
    const sequence = index + 1;

    return {
      basePrice: 125_000 + sequence * 18_750,
      currencyCode: 'ZAR',
      departmentConfigs: createZeroDepartmentConfigs(),
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

function createZeroDepartmentConfigs(): ProductDepartmentConfig[] {
  return DEPARTMENTS.map((department: Department) => ({
    defaultStationIds: [],
    department,
    durationDays: 0,
  }));
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

  await seedStationsWithCore({
    actorUserId: 'seed-job-supervisor-user',
    db: activeDb,
  });

  const seededProducts = await seedProductsWithCore({
    actorUserIds: productEditorUserIds,
    db: activeDb,
    plans: seedProductPlans,
  });

  await seedJobsWithCore({
    db: activeDb,
    products: seededProducts,
  });

  await seedQuotesWithCore({
    db: activeDb,
    products: seededProducts,
  });

  console.info(
    `[db:seed] Seed complete: ${demoUsers.length} user(s), ${seedStations.length} station(s), ${seededProducts.length} product scenario(s), ${seedJobScenarios.length} job scenario(s) (${seedJobScenarios.length - seedStandaloneJobCount} quote-backed), and ${seedQuoteScenarios.length} standalone quote scenario(s)`,
  );
}

async function seedStationsWithCore({ actorUserId, db }: { actorUserId: string; db: Db }): Promise<void> {
  console.info(`[db:seed] Creating ${seedStations.length} station catalog row(s)`);

  for (const input of seedStations) {
    await createStation({
      actorUserId,
      db,
      input,
    });
  }
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

async function seedJobsWithCore({ db, products }: { db: Db; products: readonly Product[] }): Promise<void> {
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
            input: {
              productId: product.id,
            },
          })
        : await createQuoteBackedSeedJob({
            access,
            actorUserId,
            db,
            product,
            salesUserId,
            scenarioIndex,
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

async function createQuoteBackedSeedJob({
  access,
  actorUserId,
  db,
  product,
  salesUserId,
  scenarioIndex,
}: {
  access: ReturnType<typeof createUserAccessSummary>;
  actorUserId: string;
  db: Db;
  product: Product;
  salesUserId: string;
  scenarioIndex: number;
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
      notes: 'Accepted seed quote converted into a production job.',
      productId: product.id,
      salesPersonId: salesUserId,
      validUntil: getSeedJobQuoteValidUntil(scenarioIndex),
    },
  });
  const sent = await sendQuote({ actorUserId: salesUserId, db, input: { id: quote.id } });
  const accepted = await acceptQuote({ actorUserId: salesUserId, db, input: { id: sent.id } });

  return createJobFromQuote({
    access,
    actorUserId,
    db,
    input: {
      dueEnd: getSeedJobDueDate(scenarioIndex),
      quoteId: accepted.id,
    },
  });
}

async function seedQuotesWithCore({ db, products }: { db: Db; products: readonly Product[] }): Promise<void> {
  if (products.length === 0) {
    return;
  }

  const actorUserId = 'seed-sales-user';
  const supervisorUserId = 'seed-job-supervisor-user';
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
        validUntil: scenario.validUntil,
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

    if (scenario.status === 'accepted-converted') {
      await createJobFromQuote({
        access: supervisorAccess,
        actorUserId: supervisorUserId,
        db,
        input: {
          dueEnd: '2026-08-15',
          quoteId: accepted.id,
        },
      });
    }
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
    await completeJobStage({ access, actorUserId, db, id, stage });
  }

  if (activeStageProgress) {
    await startJobStage({ access, actorUserId, db, id, stage: activeStageProgress.stage });
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

function getSeedProductAgeDays(productIndex: number): number {
  return seedProductMinAgeDays + ((productIndex * 5) % seedProductAgeDayRange);
}

function getSeedJobDueDate(scenarioIndex: number): string {
  return getSeedIsoDate({
    dayOffset: 42 + scenarioIndex * 4,
    month: 6,
    year: 2026,
  });
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

  return date.toISOString().slice(0, 10);
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
