import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getDatabaseUrl } from "./env.js";
import * as schema from "./schema/index.js";

export const queryClient = postgres(getDatabaseUrl(), {
  max: 10,
});

export const db = drizzle(queryClient, { schema });

export async function closeDatabaseConnection(): Promise<void> {
  await queryClient.end();
}
