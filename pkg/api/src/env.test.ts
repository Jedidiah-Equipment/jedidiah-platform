import { describe, expect, it } from 'vitest';

import { ApiConfig } from './env.js';

const baseEnv = {
  APP_ENV: 'development',
  DATABASE_URL: 'postgresql://localhost/test',
  APP_BASE_URL: 'http://localhost:3000',
  API_BASE_URL: 'http://localhost:7002',
  AUTH_SECRET: 'a'.repeat(32),
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3000',
  DOCUMENT_STORAGE_ACCESS_KEY_ID: 'minioadmin',
  DOCUMENT_STORAGE_BUCKET: 'jedidiah-documents',
  DOCUMENT_STORAGE_ENDPOINT: 'http://localhost:9000',
  DOCUMENT_STORAGE_FORCE_PATH_STYLE: 'true',
  DOCUMENT_STORAGE_REGION: 'us-east-1',
  DOCUMENT_STORAGE_SECRET_ACCESS_KEY: 'minioadmin',
  OPENAI_API_KEY: 'sk-test',
};

describe('API config PostHog validation', () => {
  it('keeps PostHog optional in development', () => {
    expect(ApiConfig.parse(baseEnv)).toMatchObject({
      APP_ENV: 'development',
      POSTHOG_HOST: 'https://us.i.posthog.com',
    });
  });

  it('requires a PostHog token when production capture is enabled by default', () => {
    expect(() => ApiConfig.parse({ ...baseEnv, APP_ENV: 'production' })).toThrow(
      'POSTHOG_PROJECT_TOKEN is required when PostHog is enabled',
    );
  });

  it('allows explicit opt-out in staging', () => {
    expect(ApiConfig.parse({ ...baseEnv, APP_ENV: 'staging', POSTHOG_ENABLED: 'false' })).toMatchObject({
      APP_ENV: 'staging',
      POSTHOG_ENABLED: false,
    });
  });

  it('requires document storage settings', () => {
    const { DOCUMENT_STORAGE_BUCKET: _bucket, ...env } = baseEnv;

    expect(() => ApiConfig.parse(env)).toThrow();
  });
});
