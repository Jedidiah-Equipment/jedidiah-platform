import { DateIso } from '@pkg/schema';
import type { PartCategory } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import {
  formatPartCategoryMergeConfirmation,
  getPartCategoryMarkupWarnings,
  getPartCategoryMergeSourceOptions,
  getPartCategoryMergeTargetOptions,
} from './part-category-merge.js';

const partCategory = (
  id: string,
  name: string,
  partCount: number,
  markupPercent: number | null = null,
): PartCategory => ({
  createdAt: DateIso.parse('2026-09-22T00:00:00.000Z'),
  id,
  markupPercent,
  name,
  partCount,
  updatedAt: DateIso.parse('2026-09-22T00:00:00.000Z'),
});

const boltNut = partCategory('00000000-0000-4000-8000-000000000001', 'Bolt & Nut', 40, 30);
const boltsNuts = partCategory('00000000-0000-4000-8000-000000000002', 'Bolts & Nuts', 22);
const survivor = partCategory('00000000-0000-4000-8000-000000000003', 'Bolt & Nuts', 9, 25);

describe('Part Category merge presentation', () => {
  it('offers every Part Category to keep, and every other one to merge into it', () => {
    expect(getPartCategoryMergeTargetOptions([boltNut, survivor]).map((option) => option.label)).toEqual([
      'Bolt & Nut',
      'Bolt & Nuts',
    ]);
    expect(getPartCategoryMergeSourceOptions([boltNut, boltsNuts, survivor], survivor.id)).toEqual([
      { label: 'Bolt & Nut', value: boltNut.id },
      { label: 'Bolts & Nuts', value: boltsNuts.id },
    ]);
  });

  it('spells out the moved Parts, the deletions, and irreversibility', () => {
    expect(
      formatPartCategoryMergeConfirmation({ movedPartCount: 62, sources: [boltNut, boltsNuts], target: survivor }),
    ).toBe('62 Parts move to Bolt & Nuts. Bolt & Nut and Bolts & Nuts are deleted. This cannot be undone.');
    expect(formatPartCategoryMergeConfirmation({ movedPartCount: 1, sources: [boltNut], target: survivor })).toBe(
      '1 Part moves to Bolt & Nuts. Bolt & Nut is deleted. This cannot be undone.',
    );
  });

  it('warns for each duplicate whose Parts will change markup', () => {
    expect(
      getPartCategoryMarkupWarnings({
        movedPartCount: 62,
        sources: [boltNut, boltsNuts, partCategory('00000000-0000-4000-8000-000000000004', 'Bolt', 3, 25)],
        target: survivor,
      }),
    ).toEqual([
      "Bolt & Nut is set to 30%. Its Parts will take Bolt & Nuts' 25%.",
      "Bolts & Nuts has no markup. Its Parts will take Bolt & Nuts' 25%.",
    ]);
    expect(
      getPartCategoryMarkupWarnings({
        movedPartCount: 40,
        sources: [boltNut],
        target: partCategory('00000000-0000-4000-8000-000000000005', 'Fastener', 0),
      }),
    ).toEqual(['Bolt & Nut is set to 30%. Its Parts will have no markup, as Fastener has none.']);
  });
});
