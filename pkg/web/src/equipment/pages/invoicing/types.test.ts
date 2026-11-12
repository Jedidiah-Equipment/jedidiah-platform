import { QuoteStage, type QuoteStageCounts } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';
import { invoicingListFilters } from './types.js';

const counts = (open: number): QuoteStageCounts['counts'] => ({
  ...(Object.fromEntries(QuoteStage.options.map((stage) => [stage, 0])) as QuoteStageCounts['counts']),
  'awaiting-approval': open,
  invoiced: 4,
});

describe('invoicingListFilters', () => {
  it('lists the open Quote Stages until one is picked', () => {
    expect(invoicingListFilters([], counts(1))).toEqual({
      filters: { stages: ['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice'] },
    });
  });

  it('sends the type and the invoiced plant days, dropping a malformed one', () => {
    expect(
      invoicingListFilters(
        [
          { id: 'offeringType', value: 'parts-sale' },
          { id: 'invoicedAt', value: { start: '2026-11-01', end: '30/11/2026' } },
          { id: 'stage', value: ['invoiced'] },
        ],
        counts(1),
      ),
    ).toEqual({ filters: { stages: ['invoiced'], offeringType: 'parts-sale', invoicedFrom: '2026-11-01' } });
  });
});
