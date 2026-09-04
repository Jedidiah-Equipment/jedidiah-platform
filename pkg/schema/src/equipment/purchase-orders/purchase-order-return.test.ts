import { describe, expect, test } from 'vitest';

import { CreditNoteSettlementInput } from './purchase-order-return.js';

const ID_A = '00000000-0000-4000-8000-000000000001';
const ID_B = '00000000-0000-4000-8000-000000000002';

describe('credit note settlement', () => {
  test('records the returns a credit note answers, and refuses one that answers none', () => {
    expect(CreditNoteSettlementInput.parse({ purchaseOrderId: ID_A, stockMovementIds: [ID_B] })).toEqual({
      purchaseOrderId: ID_A,
      stockMovementIds: [ID_B],
    });

    expect(() => CreditNoteSettlementInput.parse({ purchaseOrderId: ID_A, stockMovementIds: [] })).toThrow(
      'Select at least one return this credit note settles',
    );
    expect(() => CreditNoteSettlementInput.parse({ purchaseOrderId: ID_A, stockMovementIds: [ID_B, ID_B] })).toThrow(
      'A return can be settled only once by one credit note',
    );
  });
});
