import { listProductRanges } from '@pkg/core';
import { productRanges } from '@pkg/db';
import { expect } from 'vitest';

import { test } from '../../test/tester.js';
import { toRangeLabel, toRangeSlug } from './products-data.js';
import { loadFooterRanges, loadHomeRanges } from './ranges-data.js';

test('loadHomeRanges returns Range name, blurb, and Products href from the database', async ({ db }) => {
  const [withBlurb] = await db
    .insert(productRanges)
    .values({
      name: `Lander Test Range ${crypto.randomUUID()}`,
      description: 'Field-proven and built tough.',
      displayOrder: 0,
    })
    .returning();
  if (!withBlurb) throw new Error('insert did not return a row');

  const ranges = await loadHomeRanges(db);
  const found = ranges.find((range) => range.id === withBlurb.id);

  expect(found).toEqual({
    id: withBlurb.id,
    name: withBlurb.name,
    description: 'Field-proven and built tough.',
    href: '/products',
    slug: toRangeSlug(withBlurb.name),
    imageUrl: `/images/ranges/${withBlurb.id}`,
  });
});

test('loadHomeRanges renders a missing blurb as empty rather than fabricating copy', async ({ db }) => {
  const [withoutBlurb] = await db
    .insert(productRanges)
    .values({ name: `Lander Blank Range ${crypto.randomUUID()}`, description: null, displayOrder: 0 })
    .returning();
  if (!withoutBlurb) throw new Error('insert did not return a row');

  const ranges = await loadHomeRanges(db);
  const found = ranges.find((range) => range.id === withoutBlurb.id);

  expect(found?.description).toBe('');
});

test('loadFooterRanges returns the top four Ranges as chip-matching label/slug links', async ({ db }) => {
  const { ranges } = await listProductRanges({ db });
  const footer = await loadFooterRanges(db);

  // Footer teaser: the first four Ranges by display order, mapped through the same label/slug helpers the
  // Products chip bar and `?range=` filter use, so the links land on the matching filter.
  expect(footer).toHaveLength(Math.min(4, ranges.length));
  expect(footer).toEqual(
    ranges.slice(0, 4).map((range) => ({ label: toRangeLabel(range.name), slug: toRangeSlug(range.name) })),
  );
});
