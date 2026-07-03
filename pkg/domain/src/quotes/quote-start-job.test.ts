import { describe, expect, it } from 'vitest';

import { canStartJobFromQuote } from './quote-start-job.js';

describe('canStartJobFromQuote', () => {
  it('rejects quotes that already have a job', () => {
    expect(canStartJobFromQuote({ hasJob: true, kind: 'custom', status: 'draft' })).toEqual({
      allowed: false,
      reason: 'Quote already has a Job.',
    });
  });

  it.each(['draft', 'sent', 'accepted'] as const)('allows custom %s quotes to start a job', (status) => {
    expect(canStartJobFromQuote({ hasJob: false, kind: 'custom', status })).toEqual({ allowed: true });
  });

  it.each(['rejected', 'cancelled'] as const)('rejects custom %s quotes', (status) => {
    expect(canStartJobFromQuote({ hasJob: false, kind: 'custom', status })).toEqual({
      allowed: false,
      reason: 'Rejected or cancelled quotes cannot start a Job.',
    });
  });

  it('allows accepted product quotes to start a job', () => {
    expect(canStartJobFromQuote({ hasJob: false, kind: 'product', status: 'accepted' })).toEqual({ allowed: true });
  });

  it.each(['draft', 'sent', 'rejected', 'cancelled'] as const)('rejects product %s quotes', (status) => {
    expect(canStartJobFromQuote({ hasJob: false, kind: 'product', status })).toEqual({
      allowed: false,
      reason: 'Only accepted quotes can start a Job.',
    });
  });
});
