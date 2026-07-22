import { describe, expect, it } from 'vitest';

import { getWorkItemFormTotal, quoteWorkItemSummaryRows, toQuoteWorkItemFormState } from './quote-work-item-form.js';

describe('Quote Work Item form helpers', () => {
  const workItem = {
    hours: 1.5,
    name: 'Strip pump',
    parts: [{ name: 'Seal kit', quantity: 2, unitPrice: 125 }],
  };

  it('projects persisted Custom Quote rows into editable form values', () => {
    expect(
      toQuoteWorkItemFormState({
        hourlyRate: 925,
        kind: 'custom',
        workItems: [
          {
            ...workItem,
            id: 'internal-work-item-id',
            parts: [{ id: 'internal-part-id', name: 'Seal kit', quantity: 2, unitPrice: 125 }],
          },
        ],
      }),
    ).toEqual({ hourlyRate: 925, workItems: [workItem] });
    expect(toQuoteWorkItemFormState({ kind: 'product' })).toEqual({ hourlyRate: 850, workItems: [] });
  });

  it('returns zero while a numeric field contains an incomplete form value', () => {
    expect(getWorkItemFormTotal({ hourlyRate: Number.NaN, workItem })).toBe(0);
    expect(getWorkItemFormTotal({ hourlyRate: 850, workItem: { ...workItem, hours: Number.NaN } })).toBe(0);
    expect(
      getWorkItemFormTotal({
        hourlyRate: 850,
        workItem: { ...workItem, parts: [{ name: 'Seal kit', quantity: 2, unitPrice: Number.NaN }] },
      }),
    ).toBe(0);
  });

  it('uses the canonical pricing calculation for editor totals and summary rows', () => {
    expect(getWorkItemFormTotal({ hourlyRate: 850, workItem })).toBe(1525);
    expect(quoteWorkItemSummaryRows({ hourlyRate: 850, workItems: [workItem] })).toEqual([
      { name: 'Strip pump', total: 1525, workItem },
    ]);
  });
});
