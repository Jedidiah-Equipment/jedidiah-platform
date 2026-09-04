import { DateIso } from '@pkg/schema';
import type { Supplier } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { formatSupplierMergeConfirmation, getSupplierMergeOptions } from './supplier-merge.js';

const supplier = (id: string, companyName: string): Supplier => ({
  address: null,
  companyName,
  contactPerson: null,
  createdAt: DateIso.parse('2026-08-26T00:00:00.000Z'),
  email: null,
  id,
  notes: null,
  phone: null,
  thumbnailDataUrl: null,
  updatedAt: DateIso.parse('2026-08-26T00:00:00.000Z'),
});

describe('supplier merge presentation', () => {
  it('excludes the source from survivor choices', () => {
    expect(
      getSupplierMergeOptions(
        [
          supplier('00000000-0000-4000-8000-000000000001', 'Night Wolves'),
          supplier('00000000-0000-4000-8000-000000000002', 'Nightwolves'),
        ],
        '00000000-0000-4000-8000-000000000001',
      ),
    ).toEqual([{ label: 'Nightwolves', value: '00000000-0000-4000-8000-000000000002' }]);
  });

  it('spells out moved counts, retirement, and irreversibility', () => {
    expect(
      formatSupplierMergeConfirmation({
        partCount: 14,
        purchaseOrderCount: 3,
        sourceName: 'Night Wolves',
        targetName: 'Nightwolves',
      }),
    ).toBe(
      '14 parts and 3 purchase orders will move to Nightwolves. Night Wolves will be deleted. This cannot be undone.',
    );
  });
});
