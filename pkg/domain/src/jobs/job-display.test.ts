import { describe, expect, it } from 'vitest';

import {
  getJobDisplayName,
  getJobDisplayNameWithModel,
  getJobDisplaySubtitle,
  getJobOptionHint,
  getJobWorkLabel,
} from './job-display.js';

describe('job display helpers', () => {
  it('uses product names for Product Jobs', () => {
    expect(
      getJobDisplayName({
        code: 'JOB-00001',
        productName: 'Skid Steer',
        quoteKind: 'product',
        workTitle: null,
      }),
    ).toBe('Skid Steer');
  });

  it('uses work titles for Custom Jobs', () => {
    expect(
      getJobDisplayName({
        code: 'JOB-00002',
        productName: null,
        quoteKind: 'custom',
        workTitle: 'Pump skid rebuild',
      }),
    ).toBe('Pump skid rebuild');
  });

  it('falls back to the job code when the selected display fact is unavailable', () => {
    expect(
      getJobDisplayName({
        code: 'JOB-00003',
        productName: null,
        quoteKind: 'product',
        workTitle: null,
      }),
    ).toBe('JOB-00003');
  });

  it('returns typed subtitle presentation hints', () => {
    expect(
      getJobDisplaySubtitle({
        code: 'JOB-00004',
        productModelCode: 'EX-100',
        productName: 'Excavator',
        quoteKind: 'product',
        workTitle: null,
      }),
    ).toEqual({ mono: true, text: 'EX-100' });
    expect(
      getJobDisplaySubtitle({
        code: 'JOB-00005',
        productModelCode: null,
        productName: null,
        quoteKind: 'custom',
        workTitle: 'Pump skid rebuild',
      }),
    ).toEqual({ mono: false, text: 'Custom work' });
  });

  it('formats option hints and preview labels from one policy', () => {
    const productJob = {
      code: 'JOB-00006',
      productName: 'Skid Steer',
      productSerialNumber: 'SG1836260009',
      quoteKind: 'product' as const,
      workTitle: null,
    };
    const customJob = {
      code: 'JOB-00007',
      productName: null,
      productSerialNumber: null,
      quoteKind: 'custom' as const,
      workTitle: 'Pump skid rebuild',
    };

    expect(getJobDisplayNameWithModel({ ...productJob, productModelCode: 'SS-1' })).toBe('Skid Steer (SS-1)');
    expect(getJobOptionHint(productJob)).toBe('SG1836260009');
    expect(getJobOptionHint(customJob)).toBe('Pump skid rebuild');
    expect(getJobWorkLabel(productJob)).toBe('Product');
    expect(getJobWorkLabel(customJob)).toBe('Work title');
  });
});
