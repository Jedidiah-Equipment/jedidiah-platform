import { describe, expect, it } from 'vitest';

import { redactSensitiveEventProperties } from './observability';

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
});
