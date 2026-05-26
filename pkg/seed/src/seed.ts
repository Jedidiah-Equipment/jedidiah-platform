import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import { createCustomer, createPart, createSupplier, updatePart, updateSupplier } from '@pkg/core';
import { account, closeDatabaseConnection, type Db, db, user, userDepartment } from '@pkg/db';
import { demoUsers } from '@pkg/domain';
import type { Customer, CustomerCreateInput, Part, PartCreateInput, Supplier, SupplierCreateInput } from '@pkg/schema';
import { hashPassword } from 'better-auth/crypto';
import { inArray, sql } from 'drizzle-orm';

const seedCustomers = [
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
] as const satisfies readonly Pick<CustomerCreateInput, 'companyName' | 'contactPerson' | 'email'>[];

const seedSuppliers = [
  'Atlas Hydraulics',
  'Berg Steel Works',
  'Cape Bearing Supply',
  'Drakensberg Hose & Fittings',
  'East Rand Diesel Components',
  'ForgeLine Fabrication',
  'Kopano Electrical Wholesalers',
  'Ndlovu Paint Systems',
] as const satisfies readonly SupplierCreateInput['name'][];

type SeedSupplierPlan = {
  initial: SupplierCreateInput;
  update?: SupplierCreateInput;
};

type SeedPartTemplate = Omit<PartCreateInput, 'supplierId'> & {
  supplierIndex: number;
  update?: Omit<PartCreateInput, 'code' | 'supplierId' | 'supplierCode'>;
};

type SeedPartPlan = {
  initial: PartCreateInput;
  update?: PartCreateInput;
};

const seedPartTemplates: readonly SeedPartTemplate[] = [
  {
    category: 'Hydraulics',
    code: 'PART-HYD-001',
    description: 'Main lift cylinder seal kit for quarry loader hydraulic systems.',
    drawingCode: 'DRW-HYD-001',
    finish: 'Nitrile rubber',
    name: 'Lift cylinder seal kit',
    supplierCode: 'AH-SK-110',
    supplierIndex: 0,
  },
  {
    category: 'Hydraulics',
    code: 'PART-HYD-002',
    description: 'High-pressure braided hose assembly with crimped fittings.',
    drawingCode: null,
    finish: 'Black rubber',
    name: 'Braided hose assembly',
    supplierCode: 'DHF-HOSE-2400',
    supplierIndex: 3,
  },
  {
    category: 'Fabrication',
    code: 'PART-FAB-001',
    description: 'Laser-cut mild steel side plate for conveyor chute repairs.',
    drawingCode: 'DRW-FAB-041',
    finish: 'Raw steel',
    name: 'Conveyor chute side plate',
    supplierCode: 'BSW-PL-410',
    supplierIndex: 1,
    update: {
      category: 'Fabrication',
      description: 'Laser-cut mild steel side plate for reinforced conveyor chute repairs.',
      drawingCode: 'DRW-FAB-041-REV-B',
      finish: 'Shot blasted',
      name: 'Reinforced conveyor chute side plate',
    },
  },
  {
    category: 'Fabrication',
    code: 'PART-FAB-002',
    description: 'Welded guard bracket used on crusher access platforms.',
    drawingCode: 'DRW-FAB-052',
    finish: 'Hot-dip galvanized',
    name: 'Crusher guard bracket',
    supplierCode: 'FLF-BKT-052',
    supplierIndex: 5,
  },
  {
    category: 'Bearings',
    code: 'PART-BRG-001',
    description: 'Spherical roller bearing for vibrating screen shaft assemblies.',
    drawingCode: null,
    finish: 'Oiled steel',
    name: 'Spherical roller bearing',
    supplierCode: 'CBS-BRG-22320',
    supplierIndex: 2,
  },
  {
    category: 'Diesel',
    code: 'PART-DSL-001',
    description: 'Primary diesel fuel filter cartridge for plant service kits.',
    drawingCode: null,
    finish: 'Painted steel',
    name: 'Primary fuel filter cartridge',
    supplierCode: 'ERD-FIL-901',
    supplierIndex: 4,
  },
  {
    category: 'Electrical',
    code: 'PART-ELC-001',
    description: 'IP66 emergency stop station for conveyor safety circuits.',
    drawingCode: 'DRW-ELC-014',
    finish: 'Red polycarbonate',
    name: 'Emergency stop station',
    supplierCode: 'KEW-ESTOP-66',
    supplierIndex: 6,
  },
  {
    category: 'Paint',
    code: 'PART-PNT-001',
    description: 'Two-pack epoxy primer for repaired fabricated steel parts.',
    drawingCode: null,
    finish: 'Grey primer',
    name: 'Epoxy primer kit',
    supplierCode: 'NPS-EPOXY-GRY',
    supplierIndex: 7,
  },
];

export function createSeedCustomerInputs(): CustomerCreateInput[] {
  return seedCustomers.map((customer) => ({
    address: null,
    companyName: customer.companyName,
    contactPerson: customer.contactPerson,
    email: customer.email,
    notes: null,
    phone: null,
  }));
}

export function createSeedSupplierPlans(): SeedSupplierPlan[] {
  return seedSuppliers.map((name, index) => {
    const plan: SeedSupplierPlan = {
      initial: {
        name,
      },
    };

    if (index % 4 === 1) {
      plan.update = {
        name: `${name} Pty Ltd`,
      };
    }

    return plan;
  });
}

export function createSeedPartPlans(suppliers: readonly Supplier[]): SeedPartPlan[] {
  return seedPartTemplates.map((template) => {
    const supplier = suppliers[template.supplierIndex];

    if (!supplier) {
      throw new Error(`Missing seed supplier at index ${template.supplierIndex}`);
    }

    const { supplierIndex: _supplierIndex, update, ...initial } = template;
    const plan: SeedPartPlan = {
      initial: {
        ...initial,
        supplierId: supplier.id,
      },
    };

    if (update) {
      plan.update = {
        ...plan.initial,
        ...update,
      };
    }

    return plan;
  });
}

export async function seedDatabase(database?: Db): Promise<void> {
  // This seeder is intentionally not idempotent; use pnpm db:reset before running it.
  const activeDb = database ?? db;
  const now = new Date();
  const seedUserEmails = demoUsers.map((seedUser) => seedUser.email).join(', ');
  const seedUserIds = demoUsers.map((seedUser) => seedUser.id);
  const seedUserDepartments = demoUsers.flatMap((seedUser) =>
    seedUser.departments.map((department) => ({
      department,
      userId: seedUser.id,
    })),
  );
  const seedCustomerInputs = createSeedCustomerInputs();
  const seedSupplierPlans = createSeedSupplierPlans();

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
  console.info(`[db:seed] Creating ${seedCustomerInputs.length} customer scenario(s) through core services`);

  const seededCustomers = await seedCustomersWithCore({
    actorUserId: 'seed-admin-user',
    db: activeDb,
    inputs: seedCustomerInputs,
  });

  console.info(`[db:seed] Creating ${seedSupplierPlans.length} supplier scenario(s) through core services`);

  const seededSuppliers = await seedSuppliersWithCore({
    actorUserId: 'seed-admin-user',
    db: activeDb,
    plans: seedSupplierPlans,
  });

  const seedPartPlans = createSeedPartPlans(seededSuppliers);

  console.info(`[db:seed] Creating ${seedPartPlans.length} part scenario(s) through core services`);

  const seededParts = await seedPartsWithCore({
    actorUserId: 'seed-admin-user',
    db: activeDb,
    plans: seedPartPlans,
  });

  console.info(
    `[db:seed] Seed complete: ${demoUsers.length} user(s), ${seededCustomers.length} customer scenario(s), ${seededSuppliers.length} supplier scenario(s), and ${seededParts.length} part scenario(s)`,
  );
}

async function seedCustomersWithCore({
  actorUserId,
  db,
  inputs,
}: {
  actorUserId: string;
  db: Db;
  inputs: readonly CustomerCreateInput[];
}): Promise<Customer[]> {
  const seededCustomers: Customer[] = [];

  for (const input of inputs) {
    seededCustomers.push(
      await createCustomer({
        actorUserId,
        db,
        input,
      }),
    );
  }

  return seededCustomers;
}

async function seedSuppliersWithCore({
  actorUserId,
  db,
  plans,
}: {
  actorUserId: string;
  db: Db;
  plans: readonly SeedSupplierPlan[];
}): Promise<Supplier[]> {
  const seededSuppliers: Supplier[] = [];

  for (const plan of plans) {
    let supplier = await createSupplier({
      actorUserId,
      db,
      input: plan.initial,
    });

    if (plan.update) {
      supplier = await updateSupplier({
        actorUserId,
        db,
        input: {
          id: supplier.id,
          ...plan.update,
        },
      });
    }

    seededSuppliers.push(supplier);
  }

  return seededSuppliers;
}

async function seedPartsWithCore({
  actorUserId,
  db,
  plans,
}: {
  actorUserId: string;
  db: Db;
  plans: readonly SeedPartPlan[];
}): Promise<Part[]> {
  const seededParts: Part[] = [];

  for (const plan of plans) {
    let part = await createPart({
      actorUserId,
      db,
      input: plan.initial,
    });

    if (plan.update) {
      part = await updatePart({
        actorUserId,
        db,
        input: {
          id: part.id,
          ...plan.update,
        },
      });
    }

    seededParts.push(part);
  }

  return seededParts;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await seedDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
