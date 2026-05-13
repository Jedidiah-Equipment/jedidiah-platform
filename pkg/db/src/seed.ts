import { pathToFileURL } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";

import type { Database } from "./database-client.js";
import { auditEvents } from "./schema/audit.js";
import { account, user } from "./schema/auth.js";
import { products } from "./schema/product.js";

const seedProductCount = 10;

const equipmentFamilies = [
  "Wheel Loader",
  "Excavator",
  "Skid Steer",
  "Backhoe Loader",
  "Telehandler",
  "Motor Grader",
  "Dozer",
  "Dump Truck",
  "Compactor",
  "Forklift",
] as const;

const equipmentSeries = ["Atlas", "Summit", "Vertex", "Forge", "Apex"] as const;

const seedUsers = [
  {
    id: "seed-admin-user",
    name: "Seed Admin",
    email: "admin@seed.com",
    password: "12345678",
    role: "admin",
  },
  {
    id: "seed-product-editor-user",
    name: "Seed Product Editor",
    email: "pe@seed.com",
    password: "12345678",
    role: "product-editor",
  },
  {
    id: "seed-product-viewer-user",
    name: "Seed Product Viewer",
    email: "pv@seed.com",
    password: "12345678",
    role: "product-viewer",
  },
] as const;

type SeedProduct = typeof products.$inferInsert & {
  id: string;
  name: string;
  modelCode: string;
};

export function createSeedProducts(count = seedProductCount): SeedProduct[] {
  return Array.from({ length: count }, (_, index) => {
    const family = equipmentFamilies[index % equipmentFamilies.length] ?? equipmentFamilies[0];
    const series = equipmentSeries[index % equipmentSeries.length] ?? equipmentSeries[0];
    const sequence = index + 1;

    return {
      id: createSeedUuid("8000", sequence),
      basePrice: 125_000 + sequence * 18_750,
      currencyCode: "ZAR",
      description: `${series} ${family.toLowerCase()} configured for local demo inventory.`,
      modelCode: `JED-${family
        .split(" ")
        .map((part) => part[0])
        .join("")}-${String(sequence).padStart(3, "0")}`,
      name: `${series} ${family} ${String(sequence).padStart(3, "0")}`,
    };
  });
}

export async function seedDatabase(database?: Database): Promise<void> {
  const activeDb = database ?? (await import("./client.js")).db;
  const now = new Date();
  const seedProducts = createSeedProducts();
  const seedUserEmails = seedUsers.map((seedUser) => seedUser.email).join(", ");
  const productEditorUserIds = seedUsers
    .filter((seedUser) => seedUser.role === "product-editor")
    .map((seedUser) => seedUser.id);

  if (productEditorUserIds.length === 0) {
    throw new Error("At least one product-editor seed user is required to seed product audits");
  }

  console.info(`[db:seed] Starting seed at ${now.toISOString()}`);
  console.info(`[db:seed] Upserting ${seedUsers.length} seed user(s): ${seedUserEmails}`);

  await activeDb
    .insert(user)
    .values(
      seedUsers.map(({ password: _password, ...seedUser }) => ({
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

  console.info(`[db:seed] Upserted ${seedUsers.length} seed user(s)`);
  console.info(`[db:seed] Upserting ${seedUsers.length} credential account(s)`);

  await activeDb
    .insert(account)
    .values(
      await Promise.all(
        seedUsers.map(async (seedUser) => ({
          id: `${seedUser.id}-credential-account`,
          userId: seedUser.id,
          accountId: seedUser.id,
          providerId: "credential",
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

  console.info(`[db:seed] Upserted ${seedUsers.length} credential account(s)`);
  console.info(
    `[db:seed] Upserting ${seedProducts.length} product(s) and ${seedProducts.length} audit event(s)`,
  );

  await activeDb.transaction(async (tx) => {
    await tx
      .insert(products)
      .values(
        seedProducts.map((product) => ({
          ...product,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: products.id,
        set: {
          basePrice: sql`excluded.base_price`,
          currencyCode: sql`excluded.currency_code`,
          description: sql`excluded.description`,
          modelCode: sql`excluded.model_code`,
          name: sql`excluded.name`,
          updatedAt: now,
        },
      });

    await tx
      .insert(auditEvents)
      .values(
        seedProducts.map((product, index) => ({
          id: createSeedUuid("8001", index + 1),
          action: "created",
          actorUserId: productEditorUserIds[index % productEditorUserIds.length],
          changes: null,
          entityId: product.id,
          entityType: "product",
          occurredAt: now,
          summary: `Created product "${product.name}"`,
        })),
      )
      .onConflictDoUpdate({
        target: auditEvents.id,
        set: {
          action: sql`excluded.action`,
          actorUserId: sql`excluded.actor_user_id`,
          changes: sql`excluded.changes`,
          entityId: sql`excluded.entity_id`,
          entityType: sql`excluded.entity_type`,
          occurredAt: sql`excluded.occurred_at`,
          summary: sql`excluded.summary`,
        },
      });
  });

  console.info(
    `[db:seed] Seed complete: ${seedUsers.length} user(s), ${seedProducts.length} product(s)`,
  );
}

function createSeedUuid(group: string, sequence: number): string {
  return `00000000-0000-4000-${group}-${sequence.toString(16).padStart(12, "0")}`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { closeDatabaseConnection } = await import("./client.js");

  try {
    await seedDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
