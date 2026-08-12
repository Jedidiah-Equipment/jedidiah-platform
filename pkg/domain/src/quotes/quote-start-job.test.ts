import { describe, expect, it } from 'vitest';

import { canStartJobFromQuote, isReworkQuote } from './quote-start-job.js';

const productUnitId = '10000000-0000-4000-8000-000000000000';

describe('canStartJobFromQuote', () => {
  it('rejects quotes that already have a job', () => {
    expect(
      canStartJobFromQuote({
        hasLiveJob: true,
        hasProductUnit: false,
        kind: 'custom',
        reworkRequired: false,
        status: 'draft',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Quote already has a Job.',
    });
  });

  it.each(['draft', 'sent', 'accepted'] as const)('allows custom %s quotes to start a job', (status) => {
    expect(
      canStartJobFromQuote({ hasLiveJob: false, hasProductUnit: false, kind: 'custom', reworkRequired: false, status }),
    ).toEqual({
      allowed: true,
    });
  });

  it.each(['rejected', 'cancelled'] as const)('rejects custom %s quotes', (status) => {
    expect(
      canStartJobFromQuote({ hasLiveJob: false, hasProductUnit: false, kind: 'custom', reworkRequired: false, status }),
    ).toEqual({
      allowed: false,
      reason: 'Rejected or cancelled quotes cannot start a Job.',
    });
  });

  it('allows accepted product quotes to start a job', () => {
    expect(
      canStartJobFromQuote({
        hasLiveJob: false,
        hasProductUnit: false,
        kind: 'product',
        reworkRequired: false,
        status: 'accepted',
      }),
    ).toEqual({
      allowed: true,
    });
  });

  it.each(['draft', 'sent', 'rejected', 'cancelled'] as const)('rejects product %s quotes', (status) => {
    expect(
      canStartJobFromQuote({
        hasLiveJob: false,
        hasProductUnit: false,
        kind: 'product',
        reworkRequired: false,
        status,
      }),
    ).toEqual({
      allowed: false,
      reason: 'Only accepted quotes can start a Job.',
    });
  });

  it('allows an Allocation Quote to start a Rework Job when it adds Assemblies', () => {
    expect(
      canStartJobFromQuote({
        hasLiveJob: false,
        hasProductUnit: true,
        kind: 'product',
        reworkRequired: true,
        status: 'accepted',
      }),
    ).toEqual({
      allowed: true,
    });
  });

  it('rejects an Allocation Quote that adds no Assemblies', () => {
    expect(
      canStartJobFromQuote({
        hasLiveJob: false,
        hasProductUnit: true,
        kind: 'product',
        reworkRequired: false,
        status: 'accepted',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Allocation Quote has no new Assemblies to fit.',
    });
  });

  it('keeps the status denial ahead of the Allocation rule', () => {
    expect(
      canStartJobFromQuote({
        hasLiveJob: false,
        hasProductUnit: true,
        kind: 'product',
        reworkRequired: false,
        status: 'sent',
      }),
    ).toEqual({
      allowed: false,
      reason: 'Only accepted quotes can start a Job.',
    });
  });
});

describe('isReworkQuote', () => {
  it('is a Rework Quote when it references a Product Unit', () => {
    expect(isReworkQuote({ productUnitId })).toBe(true);
  });

  it('is not a Rework Quote without a Product Unit', () => {
    expect(isReworkQuote({ productUnitId: null })).toBe(false);
  });
});
