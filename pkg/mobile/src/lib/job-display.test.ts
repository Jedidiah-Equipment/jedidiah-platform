import { describe, expect, it } from 'vitest';

import { getJobDisplayName } from './job-display';

describe('getJobDisplayName', () => {
  it('uses the Product name for Product Jobs', () => {
    expect(getJobDisplayName({ code: 'JOB-00001', productName: 'Skid Steer', workTitle: null })).toBe('Skid Steer');
  });

  it('uses the Work Title for Custom Jobs without a Product', () => {
    expect(getJobDisplayName({ code: 'JOB-00002', productName: null, workTitle: 'Pump skid rebuild' })).toBe(
      'Pump skid rebuild',
    );
  });

  it('falls back to the Job code when no display title is present', () => {
    expect(getJobDisplayName({ code: 'JOB-00003', productName: null, workTitle: null })).toBe('JOB-00003');
  });
});
