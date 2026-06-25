import { listAllProducts, listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isLanderReady } from '@pkg/domain';

export type CatalogProduct = {
  id: string;
  name: string;
  modelCode: string;
  description: string;
  href: string;
  imageUrl: string;
};

export type CatalogGroup = {
  id: string;
  slug: string;
  name: string;
  label: string;
  description: string;
  count: number;
  products: CatalogProduct[];
};

export type ProductsCatalog = {
  groups: CatalogGroup[];
};

// Range names map to URL-safe filter slugs ("Silage & Grain Range" -> "silage-grain-range"). The chip bar
// and the `?range=` param both speak slugs; an unknown slug falls back to the full catalog.
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

// Shared Product -> card view model. The detail page is keyed by modelCode (`/products/:modelCode`); the
// image route is keyed by id and streams the brochure hero or a neutral placeholder. Used by the catalog
// grouping and the detail page's "More in {Range}" strip so both speak the same card shape.
export function toCatalogProduct(row: {
  id: string;
  name: string;
  modelCode: string;
  description: string | null;
}): CatalogProduct {
  return {
    id: row.id,
    name: row.name,
    modelCode: row.modelCode,
    description: row.description ?? '',
    href: `/products/${encodeURIComponent(row.modelCode)}`,
    imageUrl: `/images/products/${row.id}`,
  };
}

// Loads the whole public catalog in one pass: every Range plus every lander-ready Product, grouped by
// Range. Only lander-ready Products surface (publish toggle on and required fields filled), so the gate
// needs each Product's images, category, key features, and standard assemblies — hence the full read rather
// than the lightweight column read. Each card points at the public Product image route, which streams the
// hero or the neutral placeholder. Pricing and bays are not surfaced — this is the unauthenticated surface.
export async function loadProductsCatalog(db: Db): Promise<ProductsCatalog> {
  const [{ ranges }, allProducts] = await Promise.all([listProductRanges({ db }), listAllProducts({ db })]);

  const rows = allProducts.filter(isLanderReady);

  // Deterministic, case-insensitive name order (the whole catalog is loaded, so sort in memory rather than
  // pulling drizzle ordering helpers into this read-only surface).
  rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));

  const productsByRange = new Map<string, CatalogProduct[]>();
  for (const row of rows) {
    const list = productsByRange.get(row.rangeId) ?? [];
    list.push(toCatalogProduct(row));
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

    groups.push({
      id: range.id,
      slug: toRangeSlug(range.name),
      name: range.name,
      label: toRangeLabel(range.name),
      description: range.description ?? '',
      count: groupProducts.length,
      products: groupProducts,
    });
  }

  return { groups };
}
