import { describe, expect, it } from 'vitest';

import { toProductRangeCreateInput, toProductRangeUpdateInput } from './types.js';

const RANGE_ID = '00000000-0000-4000-8000-000000000001';

describe('product range form mappers', () => {
  it('trims the name into the create input', () => {
    expect(toProductRangeCreateInput({ name: '  Earthmoving  ' })).toEqual({ name: 'Earthmoving' });
  });

  it('trims the name into the update input and carries the id', () => {
    expect(toProductRangeUpdateInput(RANGE_ID, { name: '  Lowbed  ' })).toEqual({
      id: RANGE_ID,
      name: 'Lowbed',
    });
  });
});
