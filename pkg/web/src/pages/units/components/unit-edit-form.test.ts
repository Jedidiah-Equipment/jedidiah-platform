import { describe, expect, it } from 'vitest';

import { toProductUnitUpdateInput, toUnitEditFormValues } from './unit-edit-form.js';

const UNIT_ID = '00000000-0000-4000-8000-0000000000d1';

describe('toUnitEditFormValues', () => {
  it('shows a machine with no VIN captured as blank', () => {
    expect(toUnitEditFormValues({ vinNumber: null })).toEqual({ vinNumber: '' });
  });

  it('keeps a captured VIN', () => {
    expect(toUnitEditFormValues({ vinNumber: 'VIN-123' })).toEqual({ vinNumber: 'VIN-123' });
  });
});

describe('toProductUnitUpdateInput', () => {
  it('clears the VIN when the field is blanked', () => {
    expect(toProductUnitUpdateInput(UNIT_ID, { vinNumber: '  ' })).toEqual({ id: UNIT_ID, vinNumber: null });
  });

  it('trims a captured VIN', () => {
    expect(toProductUnitUpdateInput(UNIT_ID, { vinNumber: ' VIN-123 ' })).toEqual({
      id: UNIT_ID,
      vinNumber: 'VIN-123',
    });
  });
});
