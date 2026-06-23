import { describe, expect, it } from 'vitest';

import { toProductRangeCreateInput, toProductRangeUpdateInput } from './types.js';

const RANGE_ID = '00000000-0000-4000-8000-000000000001';

describe('product range form mappers', () => {
  it('trims the name into the create input and maps a blank description to null', () => {
    expect(toProductRangeCreateInput({ name: '  Earthmoving  ', description: '   ' })).toEqual({
      name: 'Earthmoving',
      description: null,
    });
  });

  it('carries a provided description into the create input', () => {
    expect(toProductRangeCreateInput({ name: 'Earthmoving', description: '  Tough kit.  ' })).toEqual({
      name: 'Earthmoving',
      description: 'Tough kit.',
    });
  });

  it('trims the name into the update input and carries the id and description', () => {
    expect(toProductRangeUpdateInput(RANGE_ID, { name: '  Lowbed  ', description: 'Heavy haulage.' })).toEqual({
      id: RANGE_ID,
      name: 'Lowbed',
      description: 'Heavy haulage.',
    });
  });
});
