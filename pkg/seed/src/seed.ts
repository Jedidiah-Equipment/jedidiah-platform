import { pathToFileURL } from 'node:url';
import './load-db-env.js';
import { createCustomer, createSupplier, updateSupplier } from '@pkg/core';
import { account, closeDatabaseConnection, type Db, db, user, userDepartment } from '@pkg/db';
import { demoUsers } from '@pkg/domain';
import type { Customer, CustomerCreateInput, Supplier, SupplierCreateInput } from '@pkg/schema';
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

  console.info(
    `[db:seed] Seed complete: ${demoUsers.length} user(s), ${seededCustomers.length} customer scenario(s), and ${seededSuppliers.length} supplier scenario(s)`,
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

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await seedDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
