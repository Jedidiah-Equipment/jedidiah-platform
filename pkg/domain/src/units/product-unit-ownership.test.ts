import { describe, expect, it } from 'vitest';

import { isProductUnitInStock, resolveProductUnitOwnerId } from './product-unit-ownership.js';

const CUSTOMER_A = '11111111-1111-4111-8111-111111111111';
const CUSTOMER_B = '22222222-2222-4222-8222-222222222222';

describe('resolveProductUnitOwnerId', () => {
  it('resolves an unsold Unit to Stock', () => {
    expect(resolveProductUnitOwnerId([])).toBeNull();
  });

  it('resolves to the destination of the only transfer', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: '2026-07-01T08:00:00.000Z', occurredOn: '2026-07-01', toCustomerId: CUSTOMER_A },
      ]),
    ).toBe(CUSTOMER_A);
  });

  it('resolves to the newest transfer regardless of stored order', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: '2026-07-05T08:00:00.000Z', occurredOn: '2026-07-05', toCustomerId: CUSTOMER_B },
        { createdAt: '2026-07-01T08:00:00.000Z', occurredOn: '2026-07-01', toCustomerId: CUSTOMER_A },
      ]),
    ).toBe(CUSTOMER_B);
  });

  it('returns to Stock when the newest transfer has no destination', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: '2026-07-01T08:00:00.000Z', occurredOn: '2026-07-01', toCustomerId: CUSTOMER_A },
        { createdAt: '2026-07-09T08:00:00.000Z', occurredOn: '2026-07-09', toCustomerId: null },
      ]),
    ).toBeNull();
  });

  it('reads a cancelled sale as its reversal, not as the sale', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: '2026-07-02T09:00:00.000Z', occurredOn: '2026-07-02', toCustomerId: CUSTOMER_A },
        { createdAt: '2026-07-02T11:00:00.000Z', occurredOn: '2026-07-02', toCustomerId: null },
      ]),
    ).toBeNull();
  });

  // Ownership is asserted by hand for resales, so two rows can share a date. Recording order decides.
  it('breaks a same-date tie on when the transfer was recorded', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: '2026-07-02T11:00:00.000Z', occurredOn: '2026-07-02', toCustomerId: CUSTOMER_B },
        { createdAt: '2026-07-02T09:00:00.000Z', occurredOn: '2026-07-02', toCustomerId: CUSTOMER_A },
      ]),
    ).toBe(CUSTOMER_B);
  });

  // Server callers pass database rows straight in; browser callers pass ISO strings from the API.
  it('orders Date and ISO string transfers the same way', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: new Date('2026-07-02T09:00:00.000Z'), occurredOn: '2026-07-02', toCustomerId: CUSTOMER_A },
        { createdAt: new Date('2026-07-02T11:00:00.000Z'), occurredOn: '2026-07-02', toCustomerId: CUSTOMER_B },
      ]),
    ).toBe(CUSTOMER_B);
    expect(
      resolveProductUnitOwnerId([
        { createdAt: new Date('2026-07-02T11:00:00.000Z'), occurredOn: '2026-07-02', toCustomerId: CUSTOMER_B },
        { createdAt: '2026-07-02T09:00:00.000Z', occurredOn: '2026-07-02', toCustomerId: CUSTOMER_A },
      ]),
    ).toBe(CUSTOMER_B);
  });

  it('prefers the date it happened over the date it was recorded', () => {
    expect(
      resolveProductUnitOwnerId([
        { createdAt: '2026-07-10T08:00:00.000Z', occurredOn: '2026-06-01', toCustomerId: CUSTOMER_A },
        { createdAt: '2026-07-01T08:00:00.000Z', occurredOn: '2026-07-01', toCustomerId: CUSTOMER_B },
      ]),
    ).toBe(CUSTOMER_B);
  });
});

describe('isProductUnitInStock', () => {
  it('treats a Unit with no transfers as Stock', () => {
    expect(isProductUnitInStock([])).toBe(true);
  });

  it('treats an owned Unit as not Stock', () => {
    expect(
      isProductUnitInStock([
        { createdAt: '2026-07-01T08:00:00.000Z', occurredOn: '2026-07-01', toCustomerId: CUSTOMER_A },
      ]),
    ).toBe(false);
  });

  it('treats a returned Unit as Stock again', () => {
    expect(
      isProductUnitInStock([
        { createdAt: '2026-07-01T08:00:00.000Z', occurredOn: '2026-07-01', toCustomerId: CUSTOMER_A },
        { createdAt: '2026-07-09T08:00:00.000Z', occurredOn: '2026-07-09', toCustomerId: null },
      ]),
    ).toBe(true);
  });
});
