import { describe, expect, it } from 'vitest';

import { canCreateJobFromQuote } from './quote-job-eligibility.js';

describe('canCreateJobFromQuote', () => {
  it('allows draft, sent, and accepted Quotes to source Jobs', () => {
    expect(canCreateJobFromQuote('draft')).toBe(true);
    expect(canCreateJobFromQuote('sent')).toBe(true);
    expect(canCreateJobFromQuote('accepted')).toBe(true);
  });

  it('hides Job creation for rejected Quotes', () => {
    expect(canCreateJobFromQuote('rejected')).toBe(false);
  });
});
