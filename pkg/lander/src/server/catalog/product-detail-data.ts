import { listAllProducts, listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isBrochureReady, isLanderReady } from '@pkg/domain';
import type { ProductImageSlot } from '@pkg/schema';

import { type CatalogProduct, imageUrl, toCatalogProduct, toRangeSlug } from './products-data.js';

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
  // The brochure PDF download URL, or null when the Product's brochure is not ready (publish toggle off or
  // config incomplete) — gating the link so the detail page never exposes a brochure that is unpublished or
  // cannot produce a real PDF (issue #567).
  brochureHref: string | null;
  related: CatalogProduct[];
};

const DETAIL_IMAGE_SLOTS = ['primary', 'secondary1', 'secondary2'] as const satisfies readonly ProductImageSlot[];

// Loads the Product detail view model by model code, or null when none matches OR the Product is not
// lander-ready (the route turns null into a 404 — an unready Product is invisible publicly). Reads every
// fully-mapped Product once (the marketing catalog is small) so the readiness gate, this Product's fields,
// and the same-Range "related" strip all share one pass. Pricing and bays are not surfaced.
export async function loadProductDetail(db: Db, modelCode: string): Promise<ProductDetail | null> {
  const [{ ranges }, allProducts] = await Promise.all([listProductRanges({ db }), listAllProducts({ db })]);

  const fullProduct = allProducts.find((candidate) => candidate.modelCode === modelCode);
  if (!fullProduct || !isLanderReady(fullProduct)) {
    return null;
  }

  const range = ranges.find((candidate) => candidate.id === fullProduct.rangeId);
  const rangeName = range?.name ?? '';

  // Other lander-ready Products in the same Range, sorted by name like the catalog so the related strip is
  // deterministic. Unready siblings are excluded so the strip never links to a 404.
  const related = allProducts
    .filter(
      (candidate) =>
        candidate.rangeId === fullProduct.rangeId && candidate.id !== fullProduct.id && isLanderReady(candidate),
    )
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
    imageUrl: imageUrl(`/images/products/${fullProduct.id}`, fullProduct.images.primary?.updatedAt),
    galleryImages: DETAIL_IMAGE_SLOTS.map((slot) => ({
      slot,
      imageUrl: productImageUrl(fullProduct.id, slot, fullProduct.images[slot]?.updatedAt),
    })) as ProductGalleryImages,
    // The hero highlight tiles render the Product's technical details (value is the bold headline, label
    // the small-caps caption). Lander readiness gates on at least one, so a visible Product always has tiles.
    highlights: fullProduct.technicalDetails.map((detail) => ({ value: detail.value, label: detail.label })),
    standardAssemblies: fullProduct.assemblies.filter((a) => a.kind === 'standard').map((a) => a.name),
    optionalAssemblies: fullProduct.assemblies.filter((a) => a.kind === 'optional').map((a) => a.name),
    keyFeatures: fullProduct.keyFeatures,
    brochureHref: isBrochureReady(fullProduct) ? `/downloads/products/${fullProduct.id}/brochure` : null,
    related,
  };
}

function productImageUrl(productId: string, slot: ProductImageSlot, updatedAt: string | null | undefined): string {
  return imageUrl(`/images/products/${productId}`, updatedAt, slot === 'primary' ? {} : { slot });
}
