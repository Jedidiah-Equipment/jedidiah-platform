import { describe, expect, it } from 'vitest';

import { ServerConfig } from './env.js';

const baseEnv = {
  APP_ENV: 'development',
  APP_BASE_URL: 'http://localhost:7001',
  API_BASE_URL: 'http://localhost:7002',
  AUTH_BASE_URL: 'http://localhost:7002/api/auth',
};

describe('web server config', () => {
  it('keeps PostHog disabled in development by default', () => {
    expect(ServerConfig.parse(baseEnv).clientConfig).toMatchObject({
      deploymentVersion: null,
      posthog: {
        enabled: false,
        apiHost: '/info',
        uiHost: 'https://us.posthog.com',
        release: null,
      },
    });
  });

  it('uses Railway deployment id as the deployment version when commit metadata is missing', () => {
    expect(
      ServerConfig.parse({
        ...baseEnv,
        RAILWAY_DEPLOYMENT_ID: 'deployment-123',
      }).clientConfig,
    ).toMatchObject({
      deploymentVersion: 'deployment-123',
      posthog: {
        release: 'deployment-123',
      },
    });
  });

  it('prefers Railway commit sha for deployment version metadata', () => {
    expect(
      ServerConfig.parse({
        ...baseEnv,
        RAILWAY_DEPLOYMENT_ID: 'deployment-123',
        RAILWAY_GIT_COMMIT_SHA: 'abc123',
      }).clientConfig,
    ).toMatchObject({
      deploymentVersion: 'abc123',
      posthog: {
        release: 'abc123',
      },
    });
  });

  it('requires PostHog and source map credentials in production', () => {
    expect(() =>
      ServerConfig.parse({
        ...baseEnv,
        APP_ENV: 'production',
      }),
    ).toThrow('POSTHOG_PROJECT_TOKEN is required when PostHog is enabled');
  });

  it('enables PostHog and source maps in staging when credentials are present', () => {
    const config = ServerConfig.parse({
      ...baseEnv,
      APP_ENV: 'staging',
      POSTHOG_PROJECT_TOKEN: 'phc_test',
      POSTHOG_API_KEY: 'phx_test',
      POSTHOG_PROJECT_ID: '123',
      RAILWAY_GIT_COMMIT_SHA: 'abc123',
    });

    expect(config.clientConfig.posthog).toMatchObject({
      enabled: true,
      token: 'phc_test',
      apiHost: '/info',
      release: 'abc123',
    });
    expect(config.clientConfig.deploymentVersion).toBe('abc123');
    expect(config.posthogSourceMaps).toEqual({
      enabled: true,
      apiKey: 'phx_test',
      projectId: '123',
      host: 'https://us.posthog.com',
    });
  });
});
