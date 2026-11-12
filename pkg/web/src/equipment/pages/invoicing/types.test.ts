import { QuoteStage, type QuoteStageCounts } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';
import { focusOnInvoicingStage, invoicingListFilters, listedInvoicingStages } from './types.js';

const counts = (open: number): QuoteStageCounts['counts'] => ({
  ...(Object.fromEntries(QuoteStage.options.map((stage) => [stage, 0])) as QuoteStageCounts['counts']),
  'awaiting-approval': open,
  invoiced: 4,
});
const stage = (value: unknown) => [{ id: 'stage', value }];
const invoiced = (value: unknown) => [{ id: 'invoicedAt', value }];

describe('listedInvoicingStages', () => {
  it('lists the open stages while one holds a Quote, and every invoicing stage once none does', () => {
    expect(listedInvoicingStages([], counts(1))).toEqual(['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice']);
    expect(listedInvoicingStages([], counts(0))).toEqual([
      'awaiting-pricing',
      'awaiting-approval',
      'awaiting-invoice',
      'invoiced',
    ]);
  });

  it('lists the picked invoicing stages in stage order and ignores any other stage', () => {
    expect(listedInvoicingStages(stage(['invoiced', 'awaiting-pricing']), counts(1))).toEqual([
      'awaiting-pricing',
      'invoiced',
    ]);
    expect(listedInvoicingStages(stage(['draft']), counts(1))).toEqual([
      'awaiting-pricing',
      'awaiting-approval',
      'awaiting-invoice',
    ]);
  });

  it('lists Invoiced alone for an invoiced date range with no stage picked', () => {
    expect(listedInvoicingStages(invoiced({ start: '2026-11-01' }), counts(1))).toEqual(['invoiced']);
    expect(
      listedInvoicingStages([...invoiced({ start: '2026-11-01' }), ...stage(['awaiting-invoice'])], counts(1)),
    ).toEqual(['awaiting-invoice']);
  });
});

describe('invoicingListFilters', () => {
  it('sends the type and the invoiced plant days, dropping a malformed one', () => {
    expect(
      invoicingListFilters(
        [
          { id: 'offeringType', value: 'parts-sale' },
          ...invoiced({ start: '2026-11-01', end: '30/11/2026' }),
          ...stage(['invoiced']),
        ],
        counts(1),
      ),
    ).toEqual({ filters: { stages: ['invoiced'], offeringType: 'parts-sale', invoicedFrom: '2026-11-01' } });
  });
});

describe('focusOnInvoicingStage', () => {
  it('picks the one stage and drops the invoiced range, keeping the type', () => {
    expect(
      focusOnInvoicingStage(
        [{ id: 'offeringType', value: 'product' }, ...stage(['invoiced']), ...invoiced({ start: '2026-11-01' })],
        'awaiting-pricing',
      ),
    ).toEqual([
      { id: 'offeringType', value: 'product' },
      { id: 'stage', value: ['awaiting-pricing'] },
    ]);
  });
});
