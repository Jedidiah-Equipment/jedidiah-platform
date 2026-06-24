import { listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';

import { toRangeLabel, toRangeSlug } from './products-data.js';

export type HomeRange = {
  id: string;
  name: string;
  description: string;
  // Typed as the literal route so range cards can navigate via the router's <Link> with full type safety.
  href: '/products';
  imageUrl: string;
};

// Equipment Ranges for the Home grid. Real data only: a Range with no marketing blurb renders an empty
// description rather than fabricated copy. Every card points at the public Range image route, which streams
// the real image or falls back to the neutral placeholder, so the view model needs no image presence flag.
export async function loadHomeRanges(db: Db): Promise<HomeRange[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.map((range) => ({
    id: range.id,
    name: range.name,
    description: range.description ?? '',
    href: '/products',
    imageUrl: `/images/ranges/${range.id}`,
  }));
}

// Footer "Ranges" links. The slug feeds the Products page `?range=` filter (same helpers as the chip bar),
// and the label matches the chip text. Top four by Range display order — the footer is a teaser, not the
// full list, which lives on the Products page.
export type FooterRange = { label: string; slug: string };

export async function loadFooterRanges(db: Db): Promise<FooterRange[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.slice(0, 4).map((range) => ({
    label: toRangeLabel(range.name),
    slug: toRangeSlug(range.name),
  }));
}

// Every Range label, in display order — the "Equipment of interest" options on the Contact form. Uses the
// same chip-bar label helper so the names read consistently across the site.
export async function loadRangeOptions(db: Db): Promise<string[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.map((range) => toRangeLabel(range.name));
}
