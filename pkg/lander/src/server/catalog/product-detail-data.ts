import { getProduct, listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';
import { evaluateProductBrochureCompleteness } from '@pkg/domain';
import { type ProductImageSlot, UUID } from '@pkg/schema';

import { type CatalogProduct, toCatalogProduct, toRangeSlug } from './products-data.js';

export type ProductHighlight = { value: string; label: string };
export type ProductGalleryImage = { imageUrl: string; slot: ProductImageSlot };
export type ProductGalleryImages = [ProductGalleryImage, ProductGalleryImage, ProductGalleryImage];

export type ProductDetail = {
  id: string;
  name: string;
  modelCode: string;
  rangeName: string;
  rangeSlug: string;
  tagline: string;
  description: string;
  imageUrl: string;
  galleryImages: ProductGalleryImages;
  highlights: ProductHighlight[];
  standardAssemblies: string[];
  optionalAssemblies: string[];
  keyFeatures: string[];
  // The brochure PDF download URL, or null when the Product's brochure config is incomplete — gating the
  // link so the detail page never exposes a brochure that cannot produce a real PDF (issue #567).
  brochureHref: string | null;
  related: CatalogProduct[];
};

// The highlight tiles are an agreed "discuss later" placeholder shown on every Product — not real spec
// data (issue #566). One brand-generic set keeps the hero grid looking complete until real figures land.
export const HIGHLIGHT_PLACEHOLDERS: ProductHighlight[] = [
  { value: 'SA', label: 'Built & Tested' },
  { value: 'Heavy', label: 'Duty Build' },
  { value: '2-Pack', label: 'Coated Finish' },
];

const DETAIL_IMAGE_SLOTS = ['primary', 'secondary1', 'secondary2'] as const satisfies readonly ProductImageSlot[];

// Loads the Product detail view model by model code, or null when none matches (the route turns null into
// a 404). A plain `findMany` column read of every Product (the marketing catalog is small) resolves the
// model code to an id and builds the same-Range "related" strip; the relational `where` form is avoided
// because it clashes with the package's drizzle-orm type resolution. Pricing and bays are not read.
export async function loadProductDetail(db: Db, modelCode: string): Promise<ProductDetail | null> {
  const rows = await db.query.products.findMany({
    columns: { id: true, name: true, modelCode: true, description: true, rangeId: true },
  });

  const product = rows.find((row) => row.modelCode === modelCode);
  if (!product) {
    return null;
  }

  // getProduct (typed @pkg/core service) is the canonical source for this Product's own fields: it carries
  // the description, brochure config, and kind-ordered assemblies, and backs the completeness gate.
  const [{ ranges }, fullProduct] = await Promise.all([
    listProductRanges({ db }),
    getProduct({ db, id: UUID.parse(product.id) }),
  ]);

  const brochureComplete = evaluateProductBrochureCompleteness(fullProduct).complete;

  const range = ranges.find((candidate) => candidate.id === product.rangeId);
  const rangeName = range?.name ?? '';

  // Other Products in the same Range, sorted by name like the catalog so the related strip is deterministic.
  const related = rows
    .filter((row) => row.rangeId === product.rangeId && row.id !== product.id)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
    .map(toCatalogProduct);

  // getProduct returns assemblies already ordered (standard bucket first, then displayOrder), so filtering
  // by kind preserves display order within each list.
  return {
    id: fullProduct.id,
    name: fullProduct.name,
    modelCode: fullProduct.modelCode,
    rangeName,
    rangeSlug: toRangeSlug(rangeName),
    tagline: fullProduct.category ?? '',
    description: fullProduct.description ?? '',
    imageUrl: `/images/products/${fullProduct.id}`,
    galleryImages: DETAIL_IMAGE_SLOTS.map((slot) => ({
      slot,
      imageUrl: productImageUrl(fullProduct.id, slot),
    })) as ProductGalleryImages,
    highlights: HIGHLIGHT_PLACEHOLDERS,
    standardAssemblies: fullProduct.assemblies.filter((a) => a.kind === 'standard').map((a) => a.name),
    optionalAssemblies: fullProduct.assemblies.filter((a) => a.kind === 'optional').map((a) => a.name),
    keyFeatures: fullProduct.keyFeatures,
    brochureHref: brochureComplete ? `/downloads/products/${fullProduct.id}/brochure` : null,
    related,
  };
}

function productImageUrl(productId: string, slot: ProductImageSlot): string {
  return slot === 'primary'
    ? `/images/products/${productId}`
    : `/images/products/${productId}?slot=${encodeURIComponent(slot)}`;
}
