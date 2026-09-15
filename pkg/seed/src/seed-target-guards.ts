import {
  assertLocalDatabaseTarget,
  isLoopbackHostname,
  requireDatabaseUrl,
  resolveConfirmedRemoteDatabaseUrl,
} from '@pkg/db';
import { readSeedStorageConfig, type SeedStorageConfig } from './storage.js';

export type StagingSeedConfig = {
  localDatabaseUrl: string;
  localStorage: SeedStorageConfig;
  stagingDatabaseUrl: string;
  stagingStorage: SeedStorageConfig;
};

// The ordinary writer is used by db:up and parallel:up, so it stays loopback-only.
export function assertLocalSeedTarget(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  assertLocalDatabaseTarget(databaseUrl, 'writing the local seed snapshot', env);
}

export function assertLocalSeedStorageTarget(config: SeedStorageConfig, env: NodeJS.ProcessEnv = process.env): void {
  if (!isLoopbackHostname(new URL(config.endpoint).hostname)) {
    throw new Error(
      'Refusing to write local seed objects because DOCUMENT_STORAGE_ENDPOINT is not a loopback service.',
    );
  }

  for (const prefix of ['STAGING_', 'PRODUCTION_'] as const) {
    const endpoint = env[`${prefix}DOCUMENT_STORAGE_ENDPOINT`];
    const bucket = env[`${prefix}DOCUMENT_STORAGE_BUCKET`];

    if (endpoint && bucket && storageTargetsMatch(config, { ...config, bucket, endpoint })) {
      throw new Error(`Refusing to write local seed objects because the target matches ${prefix} object storage.`);
    }
  }
}

export function resolveStagingSeedConfig(env: NodeJS.ProcessEnv = process.env): StagingSeedConfig {
  const action = 'writing local seed data to staging';
  const stagingDatabaseUrl = resolveConfirmedRemoteDatabaseUrl({
    target: 'staging',
    confirmation: { variable: 'CONFIRM_STAGING_SEED', value: 'replace-staging' },
    action,
    env,
  });
  const localDatabaseUrl = requireDatabaseUrl('local', action, env);
  assertLocalSeedTarget(localDatabaseUrl, env);

  // Production storage configuration is mandatory even though this command never creates a production
  // client: without it, a mislabeled STAGING_* bucket cannot be proven safe before the first upload.
  const localStorage = readSeedStorageConfig('', env);
  const stagingStorage = readSeedStorageConfig('STAGING_', env);
  const productionStorage = readSeedStorageConfig('PRODUCTION_', env);

  if (storageTargetsMatch(stagingStorage, productionStorage)) {
    throw new Error('Refusing staging seed write because the staging and production object stores match.');
  }

  return {
    localDatabaseUrl,
    localStorage,
    stagingDatabaseUrl,
    stagingStorage,
  };
}

export function resolveStagingResetDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return resolveConfirmedRemoteDatabaseUrl({
    target: 'staging',
    confirmation: { variable: 'CONFIRM_DB_RESET', value: 'staging' },
    action: 'resetting the staging database',
    env,
  });
}

export function storageTargetsMatch(left: SeedStorageConfig, right: SeedStorageConfig): boolean {
  return normalizeStorageTarget(left) === normalizeStorageTarget(right);
}

function normalizeStorageTarget(config: SeedStorageConfig): string {
  const endpoint = new URL(config.endpoint);
  endpoint.hash = '';
  endpoint.password = '';
  endpoint.search = '';
  endpoint.username = '';
  endpoint.pathname = endpoint.pathname.replace(/\/+$/, '');

  return `${endpoint.href.toLowerCase()}|${config.bucket}`;
}
