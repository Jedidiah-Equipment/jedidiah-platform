import { listAllProducts, listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isLanderReady, selectTranslated, translationForLocale } from '@pkg/domain';

import type { Locale } from '../../lib/locale.js';
import { imageUrl, toRangeLabel, toRangeSlug } from './products-data.js';

export type HomeRange = {
  id: string;
  name: string;
  description: string;
  // Typed as the literal route so range cards can navigate via the router's <Link> with full type safety.
  href: '/products';
  // Feeds the Products page `?range=` filter so a card lands on its own range, not the full catalog.
  slug: string;
  imageUrl: string;
};

// Equipment Ranges for the Home grid. Real data only: a Range with no marketing blurb renders an empty
// description rather than fabricated copy. Every card points at the public Range image route, which streams
// the real image or falls back to the neutral placeholder, so the view model needs no image presence flag.
export async function loadHomeRanges(db: Db, locale: Locale = 'en'): Promise<HomeRange[]> {
  const [{ ranges }, allProducts] = await Promise.all([listProductRanges({ db }), listAllProducts({ db })]);
  const visibleRangeIds = new Set(allProducts.filter(isLanderReady).map((product) => product.rangeId));

  return ranges
    .filter((range) => visibleRangeIds.has(range.id))
    .map((range) => {
      const translation = translationForLocale(range.translations, locale);

      return {
        id: range.id,
        name: selectTranslated(range.name, translation?.name),
        description: selectTranslated(range.description, translation?.description) ?? '',
        href: '/products',
        slug: toRangeSlug(range.name),
        imageUrl: imageUrl(`/images/ranges/${range.id}`, range.image?.updatedAt),
      };
    });
}

// Footer "Ranges" links. The slug feeds the Products page `?range=` filter (same helpers as the chip bar),
// and the label matches the chip text. Top four by Range display order — the footer is a teaser, not the
// full list, which lives on the Products page.
export type FooterRange = { label: string; slug: string };

export async function loadFooterRanges(db: Db, locale: Locale = 'en'): Promise<FooterRange[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.slice(0, 4).map((range) => {
    const translation = translationForLocale(range.translations, locale);

    return {
      label: toRangeLabel(selectTranslated(range.name, translation?.name)),
      slug: toRangeSlug(range.name),
    };
  });
}

export async function loadProductRangeCount(db: Db): Promise<number> {
  const { ranges } = await listProductRanges({ db });

  return ranges.length;
}

// Every Range label, in display order — the "Equipment of interest" options on the Contact form. Uses the
// same chip-bar label helper so the names read consistently across the site.
export async function loadRangeOptions(db: Db, locale: Locale = 'en'): Promise<string[]> {
  const { ranges } = await listProductRanges({ db });

  return ranges.map((range) => {
    const translation = translationForLocale(range.translations, locale);

    return toRangeLabel(selectTranslated(range.name, translation?.name));
  });
}
