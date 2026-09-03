import { describe, expect, it } from 'vitest';

import { resolveJobCustomer } from './job-customer.js';

const RIVERSIDE = { id: '11111111-1111-4111-8111-111111111111', companyName: 'Riverside Farm', thumbnailDataUrl: null };
const HILLTOP = {
  id: '22222222-2222-4222-8222-222222222222',
  companyName: 'Hilltop Transport',
  thumbnailDataUrl: null,
};

describe('resolveJobCustomer', () => {
  it('gives a Custom Job its Quote customer', () => {
    expect(resolveJobCustomer({ productUnit: null, quoteCustomer: RIVERSIDE })).toEqual(RIVERSIDE);
  });

  it('gives a Unit-bound Job the Owner of its machine', () => {
    expect(resolveJobCustomer({ productUnit: { owner: RIVERSIDE }, quoteCustomer: RIVERSIDE })).toEqual(RIVERSIDE);
  });

  it('reads a Job on an unowned Unit as Stock', () => {
    expect(resolveJobCustomer({ productUnit: { owner: null }, quoteCustomer: RIVERSIDE })).toBeNull();
  });

  // The whole point of the rule: a sold machine follows its Owner, not the Quote that first built it.
  it('follows the Unit Owner over the Quote customer when they disagree', () => {
    expect(resolveJobCustomer({ productUnit: { owner: HILLTOP }, quoteCustomer: RIVERSIDE })).toEqual(HILLTOP);
  });

  it('reads a Stock Build with no Quote as Stock', () => {
    expect(resolveJobCustomer({ productUnit: { owner: null }, quoteCustomer: null })).toBeNull();
  });
});
