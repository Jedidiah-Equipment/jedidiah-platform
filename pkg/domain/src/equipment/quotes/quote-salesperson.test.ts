import { AuthId } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { defaultQuoteSalespersonId } from './quote-salesperson.js';

describe('defaultQuoteSalespersonId', () => {
  const salespeople = [{ id: AuthId.parse('seller-1') }, { id: AuthId.parse('seller-2') }] as const;

  it('prefills the acting user when they are on the roster', () => {
    expect(defaultQuoteSalespersonId({ actingUserId: AuthId.parse('seller-2'), salespeople })).toBe('seller-2');
  });

  it('leaves the field empty when the acting user is absent', () => {
    expect(defaultQuoteSalespersonId({ actingUserId: AuthId.parse('other-user'), salespeople })).toBe('');
  });

  it('leaves the field empty without an acting user or a roster', () => {
    expect(defaultQuoteSalespersonId({ actingUserId: null, salespeople })).toBe('');
    expect(defaultQuoteSalespersonId({ actingUserId: AuthId.parse('seller-1'), salespeople: [] })).toBe('');
  });
});
