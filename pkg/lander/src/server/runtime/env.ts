import os from 'node:os';
import path from 'node:path';

import { AppEnv, EnvBoolean, NodeEnv } from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

// `.env.dev` holds real local-dev service credentials. Tests must never load it, so the override is
// skipped under NODE_ENV=test (mirrors @pkg/api and @pkg/db).
if (process.env.APP_ENV === 'development' && process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

// `.env.test` is a gitignored, test-only override (per-worktree TEST_DATABASE_URL).
// It is loaded only under NODE_ENV=test and must carry no real-service credentials.
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test', override: true, quiet: true });
}

export type LanderConfig = z.infer<typeof LanderConfig>;
export const LanderConfig = z.object({
  NODE_ENV: NodeEnv.default('development'),
  APP_ENV: AppEnv,
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(7004),
  // S3 object storage holding Range and Product imagery. The Lander reads these objects directly (ADR
  // 0007) with its own adapter; it shares the environment's bucket with the API but never writes to it.
  DOCUMENT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
  DOCUMENT_STORAGE_BUCKET: z.string().min(1),
  DOCUMENT_STORAGE_ENDPOINT: z.url(),
  DOCUMENT_STORAGE_FORCE_PATH_STYLE: EnvBoolean,
  DOCUMENT_STORAGE_REGION: z.string().min(1),
  DOCUMENT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
  // Resend powers the Contact enquiry form. The API key is optional so the site still boots and every page
  // (including Contact) renders without it — a missing key only fails a form submission, not page load
  // (issue #568). The from/to default to the company addresses but can be overridden per environment.
  RESEND_API_KEY: z.string().min(1).optional(),
  CONTACT_EMAIL_FROM: z.string().min(1).default('noreply@jedidiahequipment.co.za'),
  CONTACT_EMAIL_TO: z.string().min(1).default('info@jedidiahequipment.co.za'),
  // Local directory holding optimized (downscaled WebP) copies of catalog images (ADR 0007). Treated as an
  // ephemeral cache: it re-warms lazily after a restart or redeploy. Point this at a persistent volume mount
  // to keep it warm across deploys. Defaults to a temp dir so no configuration is required.
  LANDER_IMAGE_CACHE_DIR: z.string().min(1).default(path.join(os.tmpdir(), 'jedidiah-lander-image-cache')),
});

export function getLanderConfig(env: NodeJS.ProcessEnv = process.env): LanderConfig {
  return LanderConfig.parse(env);
}

let imageCacheDir: string | null = null;

// The optimized-image cache directory, resolved once. Isolated from getLanderConfig so the per-request
// image path does not re-parse the whole config on every hit.
export function getImageCacheDir(): string {
  if (!imageCacheDir) {
    imageCacheDir = getLanderConfig().LANDER_IMAGE_CACHE_DIR;
  }

  return imageCacheDir;
}
