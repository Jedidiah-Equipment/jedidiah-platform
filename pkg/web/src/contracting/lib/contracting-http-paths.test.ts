import { afterEach, describe, expect, test, vi } from 'vitest';
import { jobCardUrl } from './contracting-http-paths.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('jobCardUrl', () => {
  test('addresses the Job Card route by Job Number and variant', () => {
    vi.stubGlobal('window', {
      __APP_CONFIG__: {
        appBaseUrl: 'http://localhost:7001',
        appEnv: 'development',
        apiBaseUrl: 'http://localhost:7002',
        authBaseUrl: 'http://localhost:7002/api/auth',
        docsBaseUrl: 'http://localhost:7006',
      },
    });

    expect(jobCardUrl('CJOB-00042', 'internal')).toBe(
      'http://localhost:7002/api/contracting/jobs/CJOB-00042/job-card?variant=internal',
    );
  });
});
