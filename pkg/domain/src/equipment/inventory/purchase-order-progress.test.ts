import { describe, expect, it } from 'vitest';

import { derivePurchaseOrderProgress, derivePurchaseOrderStatus } from './purchase-order-progress.js';

const PART_A = 'part-a';
const PART_B = 'part-b';
const lines = [
  { partId: PART_A, quantity: 10 },
  { partId: PART_B, quantity: 4 },
];

describe('derivePurchaseOrderProgress', () => {
  it('reads an order nobody has receipted as still just sent', () => {
    expect(derivePurchaseOrderProgress({ lines, receivedByPartId: new Map() })).toBe('sent');
  });

  it('reads a first partial delivery as partially received', () => {
    expect(derivePurchaseOrderProgress({ lines, receivedByPartId: new Map([[PART_A, 3]]) })).toBe('partially-received');
  });

  it('holds at partially received while any line is still short', () => {
    const receivedByPartId = new Map([
      [PART_A, 10],
      [PART_B, 3],
    ]);

    expect(derivePurchaseOrderProgress({ lines, receivedByPartId })).toBe('partially-received');
  });

  it('reads exactly the ordered quantity on every line as received', () => {
    const receivedByPartId = new Map([
      [PART_A, 10],
      [PART_B, 4],
    ]);

    expect(derivePurchaseOrderProgress({ lines, receivedByPartId })).toBe('received');
  });

  it('reads an over-receipt as received rather than something past it', () => {
    const receivedByPartId = new Map([
      [PART_A, 12],
      [PART_B, 4],
    ]);

    expect(derivePurchaseOrderProgress({ lines, receivedByPartId })).toBe('received');
  });

  it('leaves an order with no lines at sent — nothing was ordered to receive', () => {
    expect(derivePurchaseOrderProgress({ lines: [], receivedByPartId: new Map() })).toBe('sent');
  });
});

describe('derivePurchaseOrderStatus', () => {
  it('passes a draft through untouched — receipts cannot exist before it is sent', () => {
    expect(
      derivePurchaseOrderStatus({ closedShortAt: null, lines, receivedByPartId: new Map(), status: 'draft' }),
    ).toBe('draft');
  });

  it('passes an approved order through untouched — it has not gone out to be received against', () => {
    expect(
      derivePurchaseOrderStatus({ closedShortAt: null, lines, receivedByPartId: new Map(), status: 'approved' }),
    ).toBe('approved');
  });

  it('reads a sent order nothing has arrived against as approved — the Sent tick carries the rest', () => {
    expect(derivePurchaseOrderStatus({ closedShortAt: null, lines, receivedByPartId: new Map(), status: 'sent' })).toBe(
      'approved',
    );
  });

  it('passes a cancelled order through untouched', () => {
    expect(
      derivePurchaseOrderStatus({ closedShortAt: null, lines, receivedByPartId: new Map(), status: 'cancelled' }),
    ).toBe('cancelled');
  });

  it('projects a sent order through its receipts', () => {
    expect(
      derivePurchaseOrderStatus({
        closedShortAt: null,
        lines,
        receivedByPartId: new Map([[PART_A, 3]]),
        status: 'sent',
      }),
    ).toBe('partially-received');
  });

  it('lets the close-short assertion win over the partial state it was asserted from', () => {
    expect(
      derivePurchaseOrderStatus({
        closedShortAt: '2026-08-03T09:00:00.000Z',
        lines,
        receivedByPartId: new Map([[PART_A, 3]]),
        status: 'sent',
      }),
    ).toBe('closed-short');
  });
});
