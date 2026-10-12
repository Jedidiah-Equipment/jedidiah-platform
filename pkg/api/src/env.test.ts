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

  it('keeps PostHog optional in production and treats blank Railway vars as unset', () => {
    expect(
      ApiConfig.parse({
        ...baseEnv,
        APP_ENV: 'production',
        POSTHOG_ENABLED: '',
        POSTHOG_PROJECT_TOKEN: '',
        POSTHOG_HOST: '',
      }),
    ).toMatchObject({
      APP_ENV: 'production',
      POSTHOG_ENABLED: undefined,
      POSTHOG_PROJECT_TOKEN: undefined,
      POSTHOG_HOST: 'https://us.i.posthog.com',
    });
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

  it('defaults the optimized image cache to an API-specific temp directory', () => {
    expect(ApiConfig.parse(baseEnv).API_IMAGE_CACHE_DIR).toContain('jedidiah-api-image-cache');
  });

  it('accepts the production mobile deep-link scheme as a trusted auth origin', () => {
    expect(
      ApiConfig.parse({
        ...baseEnv,
        AUTH_TRUSTED_ORIGINS: 'http://localhost:3000,jedidiahops://',
      }).AUTH_TRUSTED_ORIGINS,
    ).toContain('jedidiahops://');
  });

  it('accepts the staging mobile deep-link scheme as a trusted auth origin', () => {
    expect(
      ApiConfig.parse({
        ...baseEnv,
        AUTH_TRUSTED_ORIGINS: 'http://localhost:3000,jedidiahopsstaging://',
      }).AUTH_TRUSTED_ORIGINS,
    ).toContain('jedidiahopsstaging://');
  });
});

describe('API translation model config', () => {
  it('uses the configured assistant model by default', () => {
    expect(ApiConfig.parse({ ...baseEnv, OPENAI_MODEL: 'gpt-custom' }).OPENAI_TRANSLATION_MODEL).toBe('gpt-custom');
  });

  it('accepts a dedicated translation model override', () => {
    expect(
      ApiConfig.parse({
        ...baseEnv,
        OPENAI_MODEL: 'gpt-assistant',
        OPENAI_TRANSLATION_MODEL: 'gpt-translation',
      }).OPENAI_TRANSLATION_MODEL,
    ).toBe('gpt-translation');
  });
});
