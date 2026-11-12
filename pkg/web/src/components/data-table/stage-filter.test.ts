import { describe, expect, it } from 'vitest';
import { focusOnInvoicingStage, invoicedRange, listedInvoicingStages, pickWithoutStaleRange } from './stage-filter.js';

const stage = (value: unknown) => [{ id: 'stage', value }];
const invoiced = (value: unknown) => [{ id: 'invoicedAt', value }];

// Equipment's Quote Stages: three open stages before Invoiced.
const quoteStages = ['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice', 'invoiced'] as const;
const quoteOpen = ['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice'] as const;
const quotes = (open: number) => ({
  stages: quoteStages,
  open: quoteOpen,
  counts: { 'awaiting-pricing': 0, 'awaiting-approval': open, 'awaiting-invoice': 0, invoiced: 4 },
});

// Contracting's Invoicing: Awaiting invoice alone before Invoiced.
const jobs = (awaiting: number) => ({
  stages: ['awaiting-invoice', 'invoiced'] as const,
  open: ['awaiting-invoice'] as const,
  counts: { 'awaiting-invoice': awaiting, invoiced: 3 },
});

describe('listedInvoicingStages', () => {
  it('lists the open stages while one holds work, and every stage once none does', () => {
    expect(listedInvoicingStages([], quotes(1))).toEqual(['awaiting-pricing', 'awaiting-approval', 'awaiting-invoice']);
    expect(listedInvoicingStages([], quotes(0))).toEqual([...quoteStages]);
    expect(listedInvoicingStages([], jobs(2))).toEqual(['awaiting-invoice']);
    expect(listedInvoicingStages([], jobs(0))).toEqual(['awaiting-invoice', 'invoiced']);
  });

  it('lists the open stages before the counts arrive', () => {
    expect(listedInvoicingStages([], { ...quotes(0), counts: undefined })).toEqual([...quoteOpen]);
  });

  it('lists the picked stages in stage order and ignores any other stage', () => {
    expect(listedInvoicingStages(stage(['invoiced', 'awaiting-pricing']), quotes(1))).toEqual([
      'awaiting-pricing',
      'invoiced',
    ]);
    expect(listedInvoicingStages(stage(['draft']), quotes(1))).toEqual([...quoteOpen]);
    expect(listedInvoicingStages(stage(['upcoming']), jobs(2))).toEqual(['awaiting-invoice']);
  });

  it('lists Invoiced alone for an invoiced date range with no stage picked', () => {
    expect(listedInvoicingStages(invoiced({ start: '2026-11-01' }), quotes(1))).toEqual(['invoiced']);
    expect(listedInvoicingStages(invoiced({ start: '2026-09-01' }), jobs(2))).toEqual(['invoiced']);
    expect(
      listedInvoicingStages([...invoiced({ start: '2026-11-01' }), ...stage(['awaiting-invoice'])], quotes(1)),
    ).toEqual(['awaiting-invoice']);
  });
});

describe('invoicedRange', () => {
  it('lists every invoice until a range is picked', () => {
    expect(invoicedRange([])).toEqual({});
    expect(invoicedRange(invoiced({}))).toEqual({});
  });

  it('passes the picked days through, either end on its own', () => {
    expect(invoicedRange(invoiced({ start: '2026-09-01', end: '2026-09-30' }))).toEqual({
      invoicedFrom: '2026-09-01',
      invoicedTo: '2026-09-30',
    });
    expect(invoicedRange(invoiced({ start: '2026-09-01' }))).toEqual({ invoicedFrom: '2026-09-01' });
    expect(invoicedRange(invoiced({ end: '2026-09-30' }))).toEqual({ invoicedTo: '2026-09-30' });
  });

  it('ignores a malformed value', () => {
    expect(invoicedRange(invoiced({ start: '01/09/2026' }))).toEqual({});
    expect(invoicedRange(invoiced(['2026-09-01']))).toEqual({});
  });
});

describe('focusOnInvoicingStage', () => {
  it('picks the one stage and drops the invoiced range, keeping the other filters', () => {
    expect(
      focusOnInvoicingStage(
        [{ id: 'offeringType', value: 'product' }, ...stage(['invoiced']), ...invoiced({ start: '2026-11-01' })],
        'awaiting-pricing',
      ),
    ).toEqual([{ id: 'offeringType', value: 'product' }, ...stage(['awaiting-pricing'])]);
  });
});

describe('pickWithoutStaleRange', () => {
  const range = invoiced({ start: '2026-11-01', end: '2026-11-30' });
  const pick = (stages: string[]) => (current: { id: string; value: unknown }[]) => [
    ...current.filter((filter) => filter.id !== 'stage'),
    ...stage(stages),
  ];

  it('drops the invoiced range when the pick holds only open stages', () => {
    expect(pickWithoutStaleRange(range, pick(['awaiting-invoice']))).toEqual(stage(['awaiting-invoice']));
  });

  it('keeps the range when the pick includes Invoiced or nothing is picked', () => {
    expect(pickWithoutStaleRange(range, pick(['awaiting-invoice', 'invoiced']))).toEqual([
      ...range,
      ...stage(['awaiting-invoice', 'invoiced']),
    ]);
    expect(
      pickWithoutStaleRange([...range, ...stage(['awaiting-pricing'])], (current) =>
        current.filter((f) => f.id !== 'stage'),
      ),
    ).toEqual(range);
  });
});
