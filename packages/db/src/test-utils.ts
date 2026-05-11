import { sql } from "drizzle-orm";

import { db } from "./client.js";

const tablesToTruncate = ["verification", "account", "session", "user"] as const;

export async function resetTestDatabase(): Promise<void> {
  for (const tableName of tablesToTruncate) {
    await db.execute(sql.raw(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`));
  }
}
