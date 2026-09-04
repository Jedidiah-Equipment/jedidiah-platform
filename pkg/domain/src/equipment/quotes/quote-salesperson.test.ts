import { describe, expect, it } from 'vitest';

import { isQuoteSalespersonRole } from './quote-salesperson.js';

describe('isQuoteSalespersonRole', () => {
  it('accepts the roles that own a sale', () => {
    expect(isQuoteSalespersonRole('sales')).toBe(true);
    expect(isQuoteSalespersonRole('admin')).toBe(true);
    expect(isQuoteSalespersonRole('super-admin')).toBe(true);
  });

  // Procurement may raise a Quote, but the sale on it belongs to a salesperson.
  it('refuses a quote creator who is not a salesperson', () => {
    expect(isQuoteSalespersonRole('procurement-manager')).toBe(false);
    expect(isQuoteSalespersonRole(null)).toBe(false);
    expect(isQuoteSalespersonRole(undefined)).toBe(false);
  });
});
