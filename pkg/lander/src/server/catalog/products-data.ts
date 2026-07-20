import { listAllProducts, listProductRanges, parseImageFormat, transformSignature } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isLanderReady, localizeFields } from '@pkg/domain';
import type { Product, ProductRangeVariantTranslations, ProductTranslations } from '@pkg/schema';

import type { Locale } from '../../lib/locale.js';

export type CatalogProduct = {
  id: string;
  name: string;
  modelCode: string;
  description: string;
  variantId: string | null;
  href: string;
  imageUrl: string;
};

export type CatalogVariant = {
  id: string;
  slug: string;
  name: string;
  label: string;
};

export type CatalogGroup = {
  id: string;
  slug: string;
  name: string;
  label: string;
  description: string;
  count: number;
  variants: CatalogVariant[];
  products: CatalogProduct[];
};

export type ProductsCatalog = {
  groups: CatalogGroup[];
};

// Catalog filter names map to URL-safe slugs ("Silage & Grain Range" -> "silage-grain-range"). Range and
// Variant chips both speak slugs; the route resolves Variant slugs only inside the selected Range.
export function toRangeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Chip labels drop a trailing " Range" so the bar reads "Crosshaul", "Recharge", ... like the prototype.
export function toRangeLabel(name: string): string {
  return name.replace(/\s+Range$/i, '');
}

// Variant chip labels drop the trailing words the whole Range shares — every Crosshaul variant ends in
// "Trailer", so the bar reads "Silage Grain", "Gravel", "Slope Deck" instead of repeating the range noun on
// every chip (issue #776). Only the common suffix is stripped, and never the whole name, so the labels stay
// distinct. A lone variant keeps its full name (there is nothing to de-duplicate against).
export function toVariantLabels(names: string[]): string[] {
  if (names.length < 2) {
    return [...names];
  }

  const wordLists = names.map((name) => name.trim().split(/\s+/));
  const minLength = Math.min(...wordLists.map((words) => words.length));

  let sharedTrailing = 0;
  while (sharedTrailing < minLength - 1) {
    const offset = sharedTrailing + 1;
    const word = wordLists[0]?.[wordLists[0].length - offset]?.toLowerCase();
    if (word && wordLists.every((words) => words[words.length - offset]?.toLowerCase() === word)) {
      sharedTrailing += 1;
    } else {
      break;
    }
  }

  return wordLists.map((words) => words.slice(0, words.length - sharedTrailing).join(' '));
}

function toCatalogVariants(
  variants: {
    id: string;
    name: string;
    translations?: ProductRangeVariantTranslations | undefined;
  }[],
  groupProducts: readonly CatalogProduct[],
  locale: Locale,
): CatalogVariant[] {
  const visibleVariantIds = new Set(groupProducts.flatMap((product) => (product.variantId ? [product.variantId] : [])));
  const visibleVariants = variants.filter((variant) => visibleVariantIds.has(variant.id));
  const displayNames = visibleVariants.map(
    (variant) => localizeFields({ name: variant.name }, variant.translations, locale).name,
  );
  const labels = toVariantLabels(displayNames);
  const slugCounts = new Map<string, number>();

  for (const variant of visibleVariants) {
    const slug = toRangeSlug(variant.name);
    slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);
  }

  return visibleVariants.map((variant, index) => {
    const baseSlug = toRangeSlug(variant.name);

    return {
      id: variant.id,
      slug: slugCounts.get(baseSlug) === 1 ? baseSlug : `${baseSlug}-${variant.id}`,
      name: displayNames[index] ?? variant.name,
      label: labels[index] ?? displayNames[index] ?? variant.name,
    };
  });
}

// The public image routes are keyed by entity id, so a replaced image reuses its URL. Without a token a
// browser or CDN keeps serving the superseded bytes, so a new upload does not show on the site (issue #647).
// The `?v=` token identifies the exact bytes served at a URL, which depend on BOTH the stored file's
// `updatedAt` (see @pkg/schema EntityFile) AND the optimizer transform (transformSignature, including the
// `format` param when present): a replaced upload or a transform change both alter the URL, so the
// year-long `immutable` response the image route sends can never pin a stale representation. A missing
// image (no token) yields the bare URL, which streams the short-lived neutral placeholder.
export function imageUrl(
  path: string,
  updatedAt: string | null | undefined,
  params: Record<string, string> = {},
): string {
  const search = new URLSearchParams(params);
  const epochMs = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isNaN(epochMs)) {
    search.set('v', `${epochMs}-${transformSignature(parseImageFormat(params.format))}`);
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function compareProductDisplayOrder(
  left: Pick<Product, 'displayOrder' | 'id' | 'name'>,
  right: Pick<Product, 'displayOrder' | 'id' | 'name'>,
): number {
  return (
    left.displayOrder - right.displayOrder ||
    left.name.toLowerCase().localeCompare(right.name.toLowerCase()) ||
    left.id.localeCompare(right.id)
  );
}

// Shared Product -> card view model. The detail page is keyed by modelCode (`/products/:modelCode`); the
// image route is keyed by id and streams the brochure hero or a neutral placeholder. Used by the catalog
// grouping and the detail page's "More in {Range}" strip so both speak the same card shape.
export function toCatalogProduct(
  row: {
    id: string;
    name: string;
    modelCode: string;
    description: string | null;
    variantId?: string | null;
    images?: { primary: { updatedAt: string } | null };
    translations?: ProductTranslations | undefined;
  },
  locale: Locale,
): CatalogProduct {
  const { description, name } = localizeFields(
    { description: row.description, name: row.name },
    row.translations,
    locale,
  );

  return {
    id: row.id,
    name,
    modelCode: row.modelCode,
    description: description ?? '',
    variantId: row.variantId ?? null,
    href: `/products/${encodeURIComponent(row.modelCode)}`,
    imageUrl: imageUrl(`/images/products/${row.id}`, row.images?.primary?.updatedAt),
  };
}

// Loads the whole public catalog in one pass: every Range plus every lander-ready Product, grouped by
// Range. Only lander-ready Products surface (publish toggle on and required fields filled), so the gate
// needs each Product's images, category, key features, and standard assemblies — hence the full read rather
// than the lightweight column read. Each card points at the public Product image route, which streams the
// hero or the neutral placeholder. Pricing and bays are not surfaced — this is the unauthenticated surface.
export async function loadProductsCatalog(db: Db, locale: Locale): Promise<ProductsCatalog> {
  const [{ ranges }, allProducts] = await Promise.all([listProductRanges({ db }), listAllProducts({ db })]);

  const rows = allProducts.filter(isLanderReady);

  // Equal order values keep the existing deterministic name order, which also preserves the current
  // catalog layout when a migration initializes every Product to zero.
  rows.sort(compareProductDisplayOrder);

  const productsByRange = new Map<string, CatalogProduct[]>();
  for (const row of rows) {
    const list = productsByRange.get(row.rangeId) ?? [];
    list.push(toCatalogProduct(row, locale));
    productsByRange.set(row.rangeId, list);
  }

  // Only Ranges that actually have Products become groups (and chips); an empty Range would render a
  // pointless "0 models" section. Group order follows listProductRanges (case-insensitive name).
  const groups: CatalogGroup[] = [];
  for (const range of ranges) {
    const groupProducts = productsByRange.get(range.id);
    if (!groupProducts || groupProducts.length === 0) {
      continue;
    }

    const localized = localizeFields({ description: range.description, name: range.name }, range.translations, locale);

    groups.push({
      id: range.id,
      slug: toRangeSlug(range.name),
      name: localized.name,
      label: toRangeLabel(localized.name),
      description: localized.description ?? '',
      count: groupProducts.length,
      variants: toCatalogVariants(range.variants, groupProducts, locale),
      products: groupProducts,
    });
  }

  return { groups };
}
