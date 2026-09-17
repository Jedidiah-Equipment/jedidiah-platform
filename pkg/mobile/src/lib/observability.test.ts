import { describe, expect, it } from 'vitest';

import {
  addBreadcrumb,
  observabilityBreadcrumbsForTesting,
  redactSensitiveEventProperties,
  resetObservability,
  resolveTracingHosts,
} from './observability';

describe('observability privacy boundary', () => {
  it('removes SDK navigation URLs while retaining operational properties', () => {
    expect(
      redactSensitiveEventProperties({
        $current_url: 'jedidiahops://login?email=private@example.com',
        $pathname: '/equipment/jobs/private-job',
        platform: 'ios',
        url: 'jedidiahops://login?email=private@example.com#private',
      }),
    ).toEqual({ platform: 'ios' });
  });

  it('ignores an invalid API override instead of failing app startup', () => {
    expect(resolveTracingHosts('192.168.1.10:7002')).toEqual([]);
    expect(resolveTracingHosts('https://staging-api.example.test')).toEqual(['staging-api.example.test']);
  });

  it('drops the previous account breadcrumb trail at an identity reset', () => {
    addBreadcrumb('navigation', 'route changed', { route: '/equipment/jobs' });

    resetObservability('signed out');

    expect(observabilityBreadcrumbsForTesting()).toEqual([
      expect.objectContaining({ category: 'auth', message: 'signed out' }),
    ]);
  });
});
