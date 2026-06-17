import { NodeEnv } from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

// `.env.dev` holds real local-dev service credentials. Tests must never load it,
// or those live values leak into the test process via `override: true`.
if (process.env.APP_ENV === 'development' && process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

export type DatabaseConfig = z.infer<typeof DatabaseConfig>;
export const DatabaseConfig = z
  .object({
    NODE_ENV: NodeEnv.default('development'),
    DATABASE_URL: z.url(),
    TEST_DATABASE_URL: z.url().optional(),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV === 'test' && !env.TEST_DATABASE_URL) {
      context.addIssue({
        code: 'custom',
        path: ['TEST_DATABASE_URL'],
        message: 'TEST_DATABASE_URL is required when NODE_ENV=test',
      });
    }
  });

export function getDatabaseConfig(env: NodeJS.ProcessEnv = process.env): DatabaseConfig {
  return DatabaseConfig.parse(env);
}

export function getDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const config = getDatabaseConfig(env);

  if (config.NODE_ENV === 'test') {
    return config.TEST_DATABASE_URL ?? config.DATABASE_URL;
  }

  return config.DATABASE_URL;
}
