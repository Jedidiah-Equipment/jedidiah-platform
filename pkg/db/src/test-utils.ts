import { sql } from "drizzle-orm";

import { db } from "./client.js";

export async function resetTestDatabase(): Promise<void> {
  await db.execute(
    sql.raw(
      'TRUNCATE TABLE "products", "account", "session", "verification", "user" RESTART IDENTITY',
    ),
  );
}
