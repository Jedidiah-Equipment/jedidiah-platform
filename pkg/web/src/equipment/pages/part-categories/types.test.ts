import { DateIso } from '@pkg/schema';
import type { PartCategory } from '@pkg/schema/equipment';
import { expect, test } from 'vitest';
import { PartCategoryFormValues, partCategoryFormToInput, partCategoryFormValues } from './types.js';

const category: PartCategory = {
  createdAt: DateIso.parse('2026-09-22T00:00:00.000Z'),
  id: '00000000-0000-4000-8000-000000000001',
  markupPercent: null,
  name: 'Bolt & Nuts',
  partCount: 0,
  updatedAt: DateIso.parse('2026-09-22T00:00:00.000Z'),
};

test('saves a blank markup as null and a set one, 0% included, as its number', () => {
  const blank = partCategoryFormValues(category);
  expect(blank.markupPercent).toBeNaN();
  expect(partCategoryFormToInput(category.id, PartCategoryFormValues.parse(blank))).toEqual({
    id: category.id,
    markupPercent: null,
    name: 'Bolt & Nuts',
  });

  for (const markupPercent of [0, 25, 150.5])
    expect(
      partCategoryFormToInput(category.id, PartCategoryFormValues.parse({ ...blank, markupPercent })),
    ).toMatchObject({ markupPercent });
});
