import { QuoteLinkedJob } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { canStartJobFromQuote, getStartJobUnavailableMessage, type StartableQuote } from './start-job-eligibility.js';

const productUnitId = '10000000-0000-4000-8000-000000000000';
const linkedJob = QuoteLinkedJob.parse({ jobCode: 'JOB-00001', jobDescription: 'Fit the mast', jobId: productUnitId });

describe('start Job eligibility', () => {
  it('does not offer a Rework Job when an Allocation Quote adds no Assemblies', () => {
    const quote = {
      job: null,
      kind: 'product',
      productUnitId,
      reworkRequired: false,
      status: 'accepted',
    } satisfies StartableQuote;

    expect(canStartJobFromQuote(quote)).toBe(false);
    expect(getStartJobUnavailableMessage(quote, true)).toBe('Allocation Quote has no new Assemblies to fit.');
  });

  it('offers a Rework Job when an Allocation Quote adds Assemblies', () => {
    expect(
      canStartJobFromQuote({
        job: null,
        kind: 'product',
        productUnitId,
        reworkRequired: true,
        status: 'accepted',
      }),
    ).toBe(true);
  });

  it('offers a Job on an accepted product quote with no Product Unit', () => {
    expect(
      canStartJobFromQuote({
        job: null,
        kind: 'product',
        productUnitId: null,
        reworkRequired: false,
        status: 'accepted',
      }),
    ).toBe(true);
  });

  it('offers a Job on a draft custom quote, which carries no allocation facts', () => {
    expect(canStartJobFromQuote({ job: null, kind: 'custom', productUnitId: null, status: 'draft' })).toBe(true);
  });

  it('reports the linked Job ahead of a missing permission', () => {
    const quote = {
      job: linkedJob,
      kind: 'custom',
      productUnitId: null,
      status: 'accepted',
    } satisfies StartableQuote;

    expect(getStartJobUnavailableMessage(quote, false)).toBe('Quote already has a Job.');
  });

  it('reports the missing permission on an otherwise startable quote', () => {
    const quote = { job: null, kind: 'custom', productUnitId: null, status: 'draft' } satisfies StartableQuote;

    expect(getStartJobUnavailableMessage(quote, false)).toBe('You do not have permission to create Jobs.');
  });

  it('falls back when a startable quote is refused for another reason', () => {
    const quote = { job: null, kind: 'custom', productUnitId: null, status: 'draft' } satisfies StartableQuote;

    expect(getStartJobUnavailableMessage(quote, true)).toBe('Unable to start a Job from this quote.');
  });

  it('reports the status denial on a rejected quote', () => {
    const quote = { job: null, kind: 'custom', productUnitId: null, status: 'rejected' } satisfies StartableQuote;

    expect(getStartJobUnavailableMessage(quote, true)).toBe('Rejected or cancelled quotes cannot start a Job.');
  });
});
