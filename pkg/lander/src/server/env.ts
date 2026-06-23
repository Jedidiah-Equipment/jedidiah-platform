import { AppEnv, NodeEnv } from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

// `.env.dev` holds real local-dev service credentials. Tests must never load it, so the override is
// skipped under NODE_ENV=test (mirrors @pkg/api and @pkg/db).
if (process.env.APP_ENV === 'development' && process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

export type LanderConfig = z.infer<typeof LanderConfig>;
export const LanderConfig = z.object({
  NODE_ENV: NodeEnv.default('development'),
  APP_ENV: AppEnv,
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(7004),
});

export function getLanderConfig(env: NodeJS.ProcessEnv = process.env): LanderConfig {
  return LanderConfig.parse(env);
}
