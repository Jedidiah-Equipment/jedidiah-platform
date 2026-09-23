import { describe, expect, it } from 'vitest';
import { InvoicingSearch, invoicedInMonth, invoicedMonthOptions } from './types.js';

describe('the Invoiced month filter', () => {
  it('offers the last 24 South African months, newest first', () => {
    // 22:30 UTC on 30 September is already 1 October in Johannesburg.
    const options = invoicedMonthOptions(new Date('2026-09-30T22:30:00Z'));
    expect(options).toHaveLength(24);
    expect(options.slice(0, 2)).toEqual([
      { value: '2026-10', label: 'October 2026' },
      { value: '2026-09', label: 'September 2026' },
    ]);
    expect(options.at(-1)).toEqual({ value: '2024-11', label: 'November 2024' });
  });

  it('round-trips ?month to the first day of that month and drops a malformed one', () => {
    expect(InvoicingSearch.parse({ tab: 'invoiced', month: '2026-08' })).toEqual({ tab: 'invoiced', month: '2026-08' });
    expect(invoicedInMonth('2026-08')).toBe('2026-08-01');
    expect(InvoicingSearch.parse({ month: '08-2026' })).toEqual({ tab: 'awaiting-invoice' });
    expect(InvoicingSearch.parse({ tab: 'active' })).toEqual({ tab: 'awaiting-invoice' });
  });
});
