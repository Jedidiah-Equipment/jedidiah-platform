import type { JobQueueCounts } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { invoicedRange, listedInvoicingStages } from './types.js';

const stage = (value: unknown) => [{ id: 'stage', value }];
const counts = (awaiting: number): JobQueueCounts => ({
  upcoming: 0,
  active: 0,
  'looks-finished': 0,
  'awaiting-pricing': 0,
  'awaiting-invoice': awaiting,
  invoiced: 3,
  cancelled: 0,
});

describe('listedInvoicingStages', () => {
  it('lists Awaiting invoice until a stage is picked, and both stages once nothing is waiting', () => {
    expect(listedInvoicingStages([], counts(2))).toEqual(['awaiting-invoice']);
    expect(listedInvoicingStages([], counts(0))).toEqual(['awaiting-invoice', 'invoiced']);
  });

  it('lists the picked Invoicing stages and ignores any other stage', () => {
    expect(listedInvoicingStages(stage(['invoiced', 'awaiting-invoice']), counts(2))).toEqual([
      'awaiting-invoice',
      'invoiced',
    ]);
    expect(listedInvoicingStages(stage(['upcoming']), counts(2))).toEqual(['awaiting-invoice']);
  });

  it('lists the invoiced Jobs when only a date range is picked, since only they have an invoice date', () => {
    expect(listedInvoicingStages([{ id: 'invoicedAt', value: { start: '2026-09-01' } }], counts(2))).toEqual([
      'invoiced',
    ]);
  });
});

describe('invoicedRange', () => {
  const filter = (value: unknown) => [{ id: 'invoicedAt', value }];

  it('lists every invoice until a range is picked', () => {
    expect(invoicedRange([])).toEqual({});
    expect(invoicedRange(filter({}))).toEqual({});
  });

  it('passes the picked days through, either end on its own', () => {
    expect(invoicedRange(filter({ start: '2026-09-01', end: '2026-09-30' }))).toEqual({
      invoicedFrom: '2026-09-01',
      invoicedTo: '2026-09-30',
    });
    expect(invoicedRange(filter({ start: '2026-09-01' }))).toEqual({ invoicedFrom: '2026-09-01' });
    expect(invoicedRange(filter({ end: '2026-09-30' }))).toEqual({ invoicedTo: '2026-09-30' });
  });

  it('ignores a malformed value', () => {
    expect(invoicedRange(filter({ start: '01/09/2026' }))).toEqual({});
    expect(invoicedRange(filter(['2026-09-01']))).toEqual({});
  });
});
