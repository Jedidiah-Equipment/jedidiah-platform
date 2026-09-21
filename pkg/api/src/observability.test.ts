import { describe, expect, it, vi } from 'vitest';

import type { ApiConfig } from './env.js';
import { createObservability, isPostHogEnabled, type PostHogObservabilityClient } from './observability.js';

function mockConfig(overrides: Partial<ApiConfig> = {}): ApiConfig {
  return {
    NODE_ENV: 'test',
    APP_ENV: 'development',
    DATABASE_URL: 'postgresql://localhost/test',
    APP_BASE_URL: 'http://localhost:3000',
    API_BASE_URL: 'http://localhost:7002',
    AUTH_SECRET: 'a'.repeat(32),
    AUTH_TRUSTED_ORIGINS: ['http://localhost:3000'],
    EMAIL_PROVIDER: 'mock',
    EMAIL_FROM: 'noreply@jedidiahequipment.co.za',
    RESEND_API_KEY: undefined,
    OPENAI_API_KEY: 'sk-test',
    OPENAI_MODEL: 'gpt-5.5',
    OPENAI_REASONING_EFFORT: 'low',
    PORT: 7002,
    LOG_LEVEL: 'silent',
    LOG_DOMAINS_DISABLED: undefined,
    POSTHOG_ENABLED: undefined,
    POSTHOG_PROJECT_TOKEN: undefined,
    POSTHOG_HOST: 'https://us.i.posthog.com',
    ...overrides,
  } as unknown as ApiConfig;
}

function mockClient(): PostHogObservabilityClient {
  return {
    captureException: vi.fn(),
    flush: vi.fn(async () => undefined),
  } as unknown as PostHogObservabilityClient;
}

describe('API observability', () => {
  it('stays disabled in development by default', () => {
    expect(isPostHogEnabled(mockConfig({ POSTHOG_PROJECT_TOKEN: 'phc_test' }))).toBe(false);
  });

  it('enables PostHog in staging when a token is configured', () => {
    expect(isPostHogEnabled(mockConfig({ APP_ENV: 'staging', POSTHOG_PROJECT_TOKEN: 'phc_test' }))).toBe(true);
  });

  it('captures exceptions through the client when enabled', () => {
    const client = mockClient();
    const observability = createObservability(
      mockConfig({ APP_ENV: 'production', POSTHOG_PROJECT_TOKEN: 'phc_test' }),
      client,
    );
    const error = new Error('broken');

    observability.captureException(error, { distinctId: 'user_1', properties: { route: '/trpc' } });

    expect(client.captureException).toHaveBeenCalledWith(
      error,
      'user_1',
      expect.objectContaining({ app: 'api', appEnv: 'production', route: '/trpc' }),
    );
  });

  it('drops events when disabled', () => {
    const client = mockClient();
    const observability = createObservability(
      mockConfig({ POSTHOG_ENABLED: false, POSTHOG_PROJECT_TOKEN: 'phc_test' }),
      client,
    );

    observability.captureException(new Error('nope'));

    expect(client.captureException).not.toHaveBeenCalled();
  });
});
