import { Customer } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';
import { formatCustomerMergeConfirmation, getCustomerMergeOptions } from './customer-merge.js';

const customer = (id: string, contactPerson: string | null, createdAt: string) =>
  Customer.parse({
    id,
    companyName: 'MRB Farming',
    contactPerson,
    createdAt,
    updatedAt: createdAt,
    email: null,
    address: null,
    phone: null,
    notes: null,
    vatNumber: null,
    thumbnailDataUrl: null,
  });

describe('Customer Merge presentation', () => {
  it('excludes the duplicate and distinguishes same-named Customers by contact and creation date', () => {
    expect(
      getCustomerMergeOptions(
        [
          customer('00000000-0000-4000-8000-000000000001', null, '2026-07-15T00:00:00Z'),
          customer('00000000-0000-4000-8000-000000000002', 'Mark Buhr', '2026-06-23T00:00:00Z'),
          customer('00000000-0000-4000-8000-000000000003', null, '2026-07-15T00:00:00Z'),
        ],
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toEqual([
      { label: 'MRB Farming — Mark Buhr · created 23 Jun 2026', value: '00000000-0000-4000-8000-000000000002' },
      { label: 'MRB Farming — created 15 Jul 2026', value: '00000000-0000-4000-8000-000000000003' },
    ]);
  });
  it.each([
    [3, 1, '3 quotes and 1 unit'],
    [1, 0, '1 quote and 0 units'],
    [2000, 2, '2 000 quotes and 2 units'],
  ])('spells out moved counts and permanent deletion', (quoteCount, unitCount, counts) => {
    expect(
      formatCustomerMergeConfirmation({ quoteCount, unitCount, sourceName: 'Duplicate', targetName: 'Survivor' }),
    ).toBe(`${counts} will move to Survivor. Duplicate will be deleted. This cannot be undone.`);
  });
});
