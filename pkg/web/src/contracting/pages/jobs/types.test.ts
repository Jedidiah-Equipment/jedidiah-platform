import { describe, expect, it } from 'vitest';
import { toJobCreateInput } from './types.js';

describe('Job sign-off helpers', () => {
  it('maps browser values to a create input', () => {
    const id = '5f1c2d3e-0001-4a00-8000-000000000001';
    expect(
      toJobCreateInput({ customerId: id, farmId: id, workTypeId: id, description: '  Dam  ', foremanUserId: '' }),
    ).toEqual({
      customerId: id,
      farmId: id,
      workTypeId: id,
      description: 'Dam',
      foremanUserId: null,
    });
  });
});
