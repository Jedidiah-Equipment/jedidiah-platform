import { describe, expect, it } from 'vitest';

import {
  assertLocalSeedStorageTarget,
  assertLocalSeedTarget,
  databaseTargetsMatch,
  resolveStagingResetDatabaseUrl,
  resolveStagingSeedConfig,
} from './seed-target-guards.js';

const safeEnv = {
  APP_ENV: 'staging',
  CONFIRM_STAGING_SEED: 'replace-staging',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/jedidiah',
  DOCUMENT_STORAGE_ACCESS_KEY_ID: 'local-access-key',
  DOCUMENT_STORAGE_BUCKET: 'local-bucket',
  DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000',
  DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
  DOCUMENT_STORAGE_REGION: 'us-east-1',
  DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'local-secret-key',
  PRODUCTION_DATABASE_URL: 'postgres://production.example.test/app',
  PRODUCTION_DOCUMENT_STORAGE_ACCESS_KEY_ID: 'production-access-key',
  PRODUCTION_DOCUMENT_STORAGE_BUCKET: 'production-bucket',
  PRODUCTION_DOCUMENT_STORAGE_ENDPOINT: 'https://production-objects.example.test',
  PRODUCTION_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'false',
  PRODUCTION_DOCUMENT_STORAGE_REGION: 'af-south-1',
  PRODUCTION_DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'production-secret-key',
  STAGING_DATABASE_URL: 'postgres://staging.example.test/app',
  STAGING_DOCUMENT_STORAGE_ACCESS_KEY_ID: 'staging-access-key',
  STAGING_DOCUMENT_STORAGE_BUCKET: 'staging-bucket',
  STAGING_DOCUMENT_STORAGE_ENDPOINT: 'https://staging-objects.example.test',
  STAGING_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'false',
  STAGING_DOCUMENT_STORAGE_REGION: 'af-south-1',
  STAGING_DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
} satisfies NodeJS.ProcessEnv;

describe('local seed target guard', () => {
  it('allows loopback databases used by the normal local seed workflow', () => {
    expect(() => assertLocalSeedTarget('postgres://localhost/jedidiah', {})).not.toThrow();
    expect(() => assertLocalSeedTarget('postgres://[::1]/jedidiah', {})).not.toThrow();
  });

  it('refuses a non-loopback database even when no remote comparison env is configured', () => {
    expect(() => assertLocalSeedTarget('postgres://production.example.test/app', {})).toThrow(
      'DATABASE_URL is not a loopback database',
    );
  });

  it('refuses a non-loopback object store even when no remote comparison env is configured', () => {
    expect(() =>
      assertLocalSeedStorageTarget(
        {
          accessKeyId: 'access-key',
          bucket: 'production-bucket',
          endpoint: 'https://production-objects.example.test',
          forcePathStyle: false,
          region: 'af-south-1',
          secretAccessKey: 'secret-key',
        },
        {},
      ),
    ).toThrow('DOCUMENT_STORAGE_ENDPOINT is not a loopback service');
  });
});

describe('staging seed target guard', () => {
  it('resolves distinct local, staging, and production targets after explicit confirmation', () => {
    expect(resolveStagingSeedConfig(safeEnv)).toMatchObject({
      localDatabaseUrl: safeEnv.DATABASE_URL,
      localStorage: { bucket: 'local-bucket' },
      stagingDatabaseUrl: safeEnv.STAGING_DATABASE_URL,
      stagingStorage: { bucket: 'staging-bucket' },
    });
  });

  it('requires the staging environment and destructive confirmation', () => {
    expect(() => resolveStagingSeedConfig({ ...safeEnv, APP_ENV: 'development' })).toThrow('requires APP_ENV=staging');
    expect(() => resolveStagingSeedConfig({ ...safeEnv, CONFIRM_STAGING_SEED: undefined })).toThrow(
      'requires CONFIRM_STAGING_SEED=replace-staging',
    );
  });

  it('requires production configuration before allowing a staging write', () => {
    expect(() => resolveStagingSeedConfig({ ...safeEnv, PRODUCTION_DATABASE_URL: undefined })).toThrow(
      'PRODUCTION_DATABASE_URL is required',
    );
    expect(() => resolveStagingSeedConfig({ ...safeEnv, PRODUCTION_DOCUMENT_STORAGE_BUCKET: undefined })).toThrow(
      'PRODUCTION_DOCUMENT_STORAGE_BUCKET is required',
    );
  });

  it('refuses a staging database target that resolves to production', () => {
    expect(() =>
      resolveStagingSeedConfig({
        ...safeEnv,
        PRODUCTION_DATABASE_URL: 'postgresql://other-user:other-password@staging.example.test:5432/app?sslmode=require',
      }),
    ).toThrow('staging and production databases match');
  });

  it('refuses a staging object-store target that resolves to production', () => {
    expect(() =>
      resolveStagingSeedConfig({
        ...safeEnv,
        PRODUCTION_DOCUMENT_STORAGE_BUCKET: safeEnv.STAGING_DOCUMENT_STORAGE_BUCKET,
        PRODUCTION_DOCUMENT_STORAGE_ENDPOINT: 'https://staging-objects.example.test/',
      }),
    ).toThrow('staging and production object stores match');
  });
});

describe('database target comparison', () => {
  it('ignores credentials, postgres protocol aliases, default ports, and connection options', () => {
    expect(
      databaseTargetsMatch(
        'postgres://first:secret@database.example.test/app',
        'postgresql://second:different@database.example.test:5432/app?sslmode=require',
      ),
    ).toBe(true);
  });
});

describe('staging reset target guard', () => {
  it('returns only the explicit staging URL after confirmation and production comparison', () => {
    expect(resolveStagingResetDatabaseUrl({ ...safeEnv, CONFIRM_DB_RESET: 'staging' })).toBe(
      safeEnv.STAGING_DATABASE_URL,
    );
  });

  it('refuses reset when staging resolves to production', () => {
    expect(() =>
      resolveStagingResetDatabaseUrl({
        ...safeEnv,
        CONFIRM_DB_RESET: 'staging',
        PRODUCTION_DATABASE_URL: 'postgresql://other@staging.example.test:5432/app',
      }),
    ).toThrow('staging and production databases match');
  });
});
