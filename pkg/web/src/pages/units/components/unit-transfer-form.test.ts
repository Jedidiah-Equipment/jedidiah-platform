import { describe, expect, it } from 'vitest';

import { toProductUnitTransferInput, UnitTransferFormValues } from './unit-transfer-form.js';

const UNIT_ID = '00000000-0000-4000-8000-0000000000d1';
const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000d2';

const values = {
  destination: 'customer',
  note: '',
  occurredOn: '2026-07-01',
  toCustomerId: CUSTOMER_ID,
} satisfies UnitTransferFormValues;

describe('toProductUnitTransferInput', () => {
  it('records a resale to the chosen customer', () => {
    expect(toProductUnitTransferInput(UNIT_ID, values)).toEqual({
      id: UNIT_ID,
      note: null,
      occurredOn: '2026-07-01',
      toCustomerId: CUSTOMER_ID,
    });
  });

  // Stock is nobody holding the machine, so a return sends it to no Customer at all.
  it('returns the machine to stock as a transfer to nobody', () => {
    expect(toProductUnitTransferInput(UNIT_ID, { ...values, destination: 'stock' })).toMatchObject({
      toCustomerId: null,
    });
  });

  it('ignores a customer left selected when the machine comes back to stock', () => {
    expect(
      toProductUnitTransferInput(UNIT_ID, { ...values, destination: 'stock', toCustomerId: CUSTOMER_ID }),
    ).toMatchObject({ toCustomerId: null });
  });

  it('trims a note and drops a blank one', () => {
    expect(toProductUnitTransferInput(UNIT_ID, { ...values, note: '  Sold at auction  ' })).toMatchObject({
      note: 'Sold at auction',
    });
    expect(toProductUnitTransferInput(UNIT_ID, { ...values, note: '   ' })).toMatchObject({ note: null });
  });
});

describe('UnitTransferFormValues', () => {
  it('requires a customer when the machine goes to one', () => {
    expect(UnitTransferFormValues.safeParse({ ...values, toCustomerId: '' }).success).toBe(false);
  });

  it('needs no customer for a return to stock', () => {
    expect(UnitTransferFormValues.safeParse({ ...values, destination: 'stock', toCustomerId: '' }).success).toBe(true);
  });

  it('requires the date the transfer happened', () => {
    expect(UnitTransferFormValues.safeParse({ ...values, occurredOn: '' }).success).toBe(false);
  });
});
