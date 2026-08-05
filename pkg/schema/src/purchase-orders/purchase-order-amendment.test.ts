import { describe, expect, test } from 'vitest';

import {
  PurchaseOrderAmendAddLineInput,
  PurchaseOrderAmendmentKind,
  PurchaseOrderAmendQuantityInput,
  PurchaseOrderAmendSubstitutePartInput,
} from './purchase-order-amendment.js';

const ID_A = '00000000-0000-4000-8000-000000000001';
const ID_B = '00000000-0000-4000-8000-000000000002';
const ID_C = '00000000-0000-4000-8000-000000000003';

describe('Purchase Order amendment contracts', () => {
  test('carries the three ways a sent order changes', () => {
    expect(PurchaseOrderAmendmentKind.options).toEqual(['quantity-change', 'add-line', 'substitute-part']);
  });

  test('requires a note on every kind — the call is the recorded event', () => {
    const quantityChange = { id: ID_A, partId: ID_B, quantity: 3 };

    expect(PurchaseOrderAmendQuantityInput.parse({ ...quantityChange, note: ' Supplier short ' })).toEqual({
      id: ID_A,
      note: 'Supplier short',
      partId: ID_B,
      quantity: 3,
    });
    expect(() => PurchaseOrderAmendQuantityInput.parse(quantityChange)).toThrow();
    expect(() => PurchaseOrderAmendQuantityInput.parse({ ...quantityChange, note: '   ' })).toThrow();
    expect(() => PurchaseOrderAmendAddLineInput.parse({ ...quantityChange, unitPrice: 10 })).toThrow();
  });

  test('holds an added line to the same quantity and price rules a draft line has', () => {
    const addLine = { id: ID_A, note: 'Phoned through', partId: ID_B, quantity: 2, unitPrice: 12.5 };

    expect(PurchaseOrderAmendAddLineInput.parse(addLine)).toEqual(addLine);
    expect(() => PurchaseOrderAmendAddLineInput.parse({ ...addLine, quantity: 0 })).toThrow();
    expect(() => PurchaseOrderAmendAddLineInput.parse({ ...addLine, unitPrice: -1 })).toThrow();
    expect(() => PurchaseOrderAmendAddLineInput.parse({ ...addLine, unitPrice: 12.555 })).toThrow();
  });

  test('substitutes one Part for a different one, with its own agreed quantity and price', () => {
    const substitution = {
      id: ID_A,
      newPartId: ID_C,
      note: 'Supplier sent the 8 mm instead',
      partId: ID_B,
      quantity: 4,
      unitPrice: 30,
    };

    expect(PurchaseOrderAmendSubstitutePartInput.parse(substitution)).toEqual(substitution);
    expect(() => PurchaseOrderAmendSubstitutePartInput.parse({ ...substitution, newPartId: ID_B })).toThrow(
      'Choose a different Part to substitute in',
    );
  });
});
