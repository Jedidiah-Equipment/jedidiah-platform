import { readSeedStorageConfig, type SeedStorageConfig } from './storage.js';

const stagingSeedConfirmation = 'replace-staging';

export type StagingSeedConfig = {
  localDatabaseUrl: string;
  localStorage: SeedStorageConfig;
  stagingDatabaseUrl: string;
  stagingStorage: SeedStorageConfig;
};

export function assertLocalSeedTarget(databaseUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  const hostname = normalizedHostname(databaseUrl);

  // The ordinary writer is used by db:up and parallel:up. Keeping it loopback-only makes a missing or
  // misspelled remote env variable insufficient to turn that everyday command into a production write.
  if (!isLoopbackHostname(hostname)) {
    throw new Error('Refusing to write the local seed snapshot because DATABASE_URL is not a loopback database.');
  }

  for (const remoteName of ['STAGING_DATABASE_URL', 'PRODUCTION_DATABASE_URL'] as const) {
    const remoteUrl = env[remoteName];

    if (remoteUrl && databaseTargetsMatch(databaseUrl, remoteUrl)) {
      throw new Error(`Refusing to write the local seed snapshot because DATABASE_URL matches ${remoteName}.`);
    }
  }
}

export function assertLocalSeedStorageTarget(config: SeedStorageConfig, env: NodeJS.ProcessEnv = process.env): void {
  if (!isLoopbackHostname(normalizedHostname(config.endpoint))) {
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
  if (env.APP_ENV !== 'staging') {
    throw new Error('Writing local seed data to staging requires APP_ENV=staging.');
  }

  if (env.CONFIRM_STAGING_SEED !== stagingSeedConfirmation) {
    throw new Error(`Writing local seed data to staging requires CONFIRM_STAGING_SEED=${stagingSeedConfirmation}.`);
  }

  const localDatabaseUrl = requireEnv('DATABASE_URL', env);
  const stagingDatabaseUrl = requireEnv('STAGING_DATABASE_URL', env);
  const productionDatabaseUrl = requireEnv('PRODUCTION_DATABASE_URL', env);

  assertLocalSeedTarget(localDatabaseUrl, env);
  assertDifferentDatabaseTarget('local', localDatabaseUrl, 'staging', stagingDatabaseUrl);
  assertDifferentDatabaseTarget('staging', stagingDatabaseUrl, 'production', productionDatabaseUrl);

  // Production storage configuration is mandatory even though this command never creates a production
  // client: without it, a mislabeled STAGING_* bucket cannot be proven safe before the first upload.
  const localStorage = readSeedStorageConfig('', env);
  const stagingStorage = readSeedStorageConfig('STAGING_', env);
  const productionStorage = readSeedStorageConfig('PRODUCTION_', env);

  assertDifferentStorageTarget('staging', stagingStorage, 'production', productionStorage);

  return {
    localDatabaseUrl,
    localStorage,
    stagingDatabaseUrl,
    stagingStorage,
  };
}

export function resolveStagingResetDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.APP_ENV !== 'staging') {
    throw new Error('Remote database reset requires APP_ENV=staging.');
  }

  if (env.CONFIRM_DB_RESET !== 'staging') {
    throw new Error('Remote database reset requires CONFIRM_DB_RESET=staging.');
  }

  const stagingDatabaseUrl = requireEnvForAction('STAGING_DATABASE_URL', 'reset the staging database', env);
  const productionDatabaseUrl = requireEnvForAction('PRODUCTION_DATABASE_URL', 'reset the staging database', env);

  assertDifferentDatabaseTarget('staging', stagingDatabaseUrl, 'production', productionDatabaseUrl);
  return stagingDatabaseUrl;
}

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required to write local seed data to staging.`);
  }

  return value;
}

function requireEnvForAction(name: string, action: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required to ${action}.`);
  }

  return value;
}

function assertDifferentDatabaseTarget(leftName: string, leftUrl: string, rightName: string, rightUrl: string): void {
  if (databaseTargetsMatch(leftUrl, rightUrl)) {
    throw new Error(`Refusing staging seed write because the ${leftName} and ${rightName} databases match.`);
  }
}

export function databaseTargetsMatch(leftUrl: string, rightUrl: string): boolean {
  return normalizeDatabaseTarget(leftUrl) === normalizeDatabaseTarget(rightUrl);
}

function normalizeDatabaseTarget(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const protocol = url.protocol === 'postgresql:' ? 'postgres:' : url.protocol;
  const port = url.port || (protocol === 'postgres:' ? '5432' : '');

  // Credentials and connection options do not change which database receives destructive statements.
  return `${protocol}//${url.hostname.toLowerCase()}:${port}${url.pathname}`;
}

function normalizedHostname(rawUrl: string): string {
  return new URL(rawUrl).hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '::1' || hostname.startsWith('127.');
}

function assertDifferentStorageTarget(
  leftName: string,
  left: SeedStorageConfig,
  rightName: string,
  right: SeedStorageConfig,
): void {
  if (storageTargetsMatch(left, right)) {
    throw new Error(`Refusing staging seed write because the ${leftName} and ${rightName} object stores match.`);
  }
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
