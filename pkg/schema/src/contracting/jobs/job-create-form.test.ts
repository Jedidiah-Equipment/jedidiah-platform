import { describe, expect, it } from 'vitest';
import { JobCreateValues, toJobCreateInput } from './job-create-form.js';

const id = '5f1c2d3e-0001-4a00-8000-000000000001';

describe('the New job form', () => {
  it('asks for the Customer, Farm and Work Type in form order', () => {
    const result = JobCreateValues.safeParse({
      customerId: '',
      farmId: '',
      workTypeId: '',
      description: '',
      foremanUserId: '',
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Choose a Customer',
      'Choose a Farm',
      'Choose a Work Type',
    ]);
  });

  it('maps form values to a create input, a blank description and an unchosen Foreman as none', () => {
    expect(
      toJobCreateInput({ customerId: id, farmId: id, workTypeId: id, description: '  Dam  ', foremanUserId: '' }),
    ).toEqual({ customerId: id, farmId: id, workTypeId: id, description: 'Dam', foremanUserId: null });
    expect(
      toJobCreateInput({
        customerId: id,
        farmId: id,
        workTypeId: id,
        description: '   ',
        foremanUserId: 'foreman-sipho',
      }),
    ).toEqual({ customerId: id, farmId: id, workTypeId: id, description: null, foremanUserId: 'foreman-sipho' });
  });
});
