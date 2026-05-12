import { sql } from "drizzle-orm";

import { db } from "./client.js";
import { user } from "./schema/auth.js";

const seedUsers = [
  {
    id: "seed-admin-user",
    name: "Seed Admin",
    email: "admin@example.com",
    role: "admin",
  },
  {
    id: "seed-product-editor-user",
    name: "Seed Product Editor",
    email: "product-editor@example.com",
    role: "product-editor",
  },
  {
    id: "seed-product-viewer-user",
    name: "Seed Product Viewer",
    email: "product-viewer@example.com",
    role: "product-viewer",
  },
] as const;

export async function seedDatabase(): Promise<void> {
  const now = new Date();

  await db
    .insert(user)
    .values(
      seedUsers.map((seedUser) => ({
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
}
