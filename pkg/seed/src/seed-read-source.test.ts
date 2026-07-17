import { describe, expect, it } from 'vitest';

import { resolveSeedReadSource } from './seed-read-source.js';
import { readSeedStorageConfig } from './storage.js';

const remoteEnv = {
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
  STAGING_DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
  STAGING_DOCUMENT_STORAGE_REGION: 'us-east-1',
  STAGING_DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'staging-secret-key',
} satisfies NodeJS.ProcessEnv;

describe('seed read source selection', () => {
  it('reads from staging by default', () => {
    const source = resolveSeedReadSource(undefined, remoteEnv);

    expect({ source, storage: readSeedStorageConfig(source.storagePrefix, remoteEnv) }).toEqual({
      source: {
        databaseUrl: 'postgres://staging.example.test/app',
        name: 'staging',
        storagePrefix: 'STAGING_',
      },
      storage: {
        accessKeyId: 'staging-access-key',
        bucket: 'staging-bucket',
        endpoint: 'https://staging-objects.example.test',
        forcePathStyle: true,
        region: 'us-east-1',
        secretAccessKey: 'staging-secret-key',
      },
    });
  });

  it('reads from production when explicitly selected', () => {
    const source = resolveSeedReadSource('production', remoteEnv);

    expect({ source, storage: readSeedStorageConfig(source.storagePrefix, remoteEnv) }).toEqual({
      source: {
        databaseUrl: 'postgres://production.example.test/app',
        name: 'production',
        storagePrefix: 'PRODUCTION_',
      },
      storage: {
        accessKeyId: 'production-access-key',
        bucket: 'production-bucket',
        endpoint: 'https://production-objects.example.test',
        forcePathStyle: false,
        region: 'af-south-1',
        secretAccessKey: 'production-secret-key',
      },
    });
  });

  it('rejects unsupported sources', () => {
    expect(() => resolveSeedReadSource('local', {})).toThrow(
      'Unsupported seed read source "local". Expected staging or production.',
    );
  });

  it('identifies a missing source database URL', () => {
    expect(() => resolveSeedReadSource('production', {})).toThrow(
      'PRODUCTION_DATABASE_URL is required to read the production seed snapshot.',
    );
  });

  it('identifies missing source storage configuration', () => {
    const source = resolveSeedReadSource('production', {
      PRODUCTION_DATABASE_URL: 'postgres://production.example.test/app',
    });

    expect(() => readSeedStorageConfig(source.storagePrefix, {})).toThrow(
      'PRODUCTION_DOCUMENT_STORAGE_BUCKET is required to sync doc-store objects.',
    );
  });
});
