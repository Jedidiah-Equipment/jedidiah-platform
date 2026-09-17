import { describe, expect, it } from 'vitest';

import { shouldReportApiMutationError } from './api-error.js';

describe('shouldReportApiMutationError', () => {
  it('reports failures without an expected API classification', () => {
    expect(shouldReportApiMutationError(new Error('network failed'))).toBe(true);
    expect(shouldReportApiMutationError({ data: { code: 'INTERNAL_SERVER_ERROR' } })).toBe(true);
  });

  it('does not report app-coded or bad-request outcomes', () => {
    expect(shouldReportApiMutationError({ data: { appCode: 'quote.cancelled', code: 'CONFLICT' } })).toBe(false);
    expect(shouldReportApiMutationError({ data: { code: 'BAD_REQUEST' } })).toBe(false);
  });
});
