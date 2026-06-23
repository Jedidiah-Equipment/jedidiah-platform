import { listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';

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
function toRangeLabel(name: string): string {
  return name.replace(/\s+Range$/i, '');
}

// Loads the whole public catalog in one pass: every Range plus every Product, grouped by Range. Each card
// points at the public Product image route, which streams the brochure hero or the neutral placeholder, so
// the view model carries no image-presence flag. Pricing, assemblies and bays are intentionally not read —
// this is the unauthenticated marketing surface.
export async function loadProductsCatalog(db: Db): Promise<ProductsCatalog> {
  const [{ ranges }, rows] = await Promise.all([
    listProductRanges({ db }),
    db.query.products.findMany({
      columns: { id: true, name: true, modelCode: true, description: true, rangeId: true },
    }),
  ]);

  // Deterministic, case-insensitive name order (the whole catalog is loaded, so sort in memory rather than
  // pulling drizzle ordering helpers into this read-only surface).
  rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id));

  const productsByRange = new Map<string, CatalogProduct[]>();
  for (const row of rows) {
    const list = productsByRange.get(row.rangeId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      modelCode: row.modelCode,
      description: row.description ?? '',
      href: `/products/${row.id}`,
      imageUrl: `/images/products/${row.id}`,
    });
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
