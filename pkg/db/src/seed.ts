import { pathToFileURL } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";

import { closeDatabaseConnection, db } from "./client.js";
import { account, user } from "./schema/auth.js";

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

export async function seedDatabase(): Promise<void> {
  const now = new Date();

  await db
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

  await db
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
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    await seedDatabase();
  } finally {
    await closeDatabaseConnection();
  }
}
