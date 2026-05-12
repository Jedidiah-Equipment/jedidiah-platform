import { hashPassword } from "better-auth/crypto";
import { sql } from "drizzle-orm";

import { db } from "./client.js";
import { account, user } from "./schema/auth.js";

const seedUsers = [
  {
    id: "seed-admin-user",
    name: "Seed Admin",
    email: "admin@example.com",
    password: "password123",
    role: "admin",
  },
  {
    id: "seed-product-editor-user",
    name: "Seed Product Editor",
    email: "product-editor@example.com",
    password: "password123",
    role: "product-editor",
  },
  {
    id: "seed-product-viewer-user",
    name: "Seed Product Viewer",
    email: "product-viewer@example.com",
    password: "password123",
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
      target: user.email,
      set: {
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
