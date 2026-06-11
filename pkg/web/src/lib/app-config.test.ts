import { describe, expect, it } from 'vitest';

import { parseClientConfig } from './app-config.js';

describe('client config', () => {
  it('parses local defaults', () => {
    expect(
      parseClientConfig({
        appEnv: 'development',
        appBaseUrl: 'http://localhost:7001',
        apiBaseUrl: 'http://localhost:7002',
        authBaseUrl: 'http://localhost:7002/api/auth',
      }),
    ).toEqual({
      appEnv: 'development',
      appBaseUrl: 'http://localhost:7001',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
      deploymentVersion: null,
      posthog: {
        enabled: false,
        apiHost: '/info',
        uiHost: 'https://us.posthog.com',
        release: null,
      },
    });
  });
});
