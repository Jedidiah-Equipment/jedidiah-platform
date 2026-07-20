import { listAllProducts, listProductRanges, OG_IMAGE_FORMAT } from '@pkg/core';
import type { Db } from '@pkg/db';
import { isBrochureReady, isLanderReady, localizeFields } from '@pkg/domain';
import type { AssemblyKind, ProductImageSlot } from '@pkg/schema';
import { CANONICAL_LOCALE, type Locale } from '../../lib/locale.js';
import {
  type CatalogProduct,
  compareProductDisplayOrder,
  imageUrl,
  toCatalogProduct,
  toRangeSlug,
} from './products-data.js';

export type ProductHighlight = { value: string; label: string };
export type ProductGalleryImage = { imageUrl: string; slot: ProductImageSlot };
export type ProductGalleryImages = [ProductGalleryImage, ProductGalleryImage, ProductGalleryImage];

export type ProductDetail = {
  id: string;
  name: string;
  modelCode: string;
  rangeName: string;
  rangeSlug: string;
  variant: string | null;
  tagline: string;
  description: string;
  imageUrl: string;
  // JPEG variant of the primary image for og:image/twitter:image — social scrapers (Slack, WhatsApp,
  // Facebook, LinkedIn) download WebP but refuse to render it as a preview card.
  ogImageUrl: string;
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
export async function loadProductDetail(db: Db, modelCode: string, locale: Locale): Promise<ProductDetail | null> {
  const [{ ranges }, allProducts] = await Promise.all([listProductRanges({ db }), listAllProducts({ db })]);

  const fullProduct = allProducts.find((candidate) => candidate.modelCode === modelCode);
  if (!fullProduct || !isLanderReady(fullProduct)) {
    return null;
  }

  const range = ranges.find((candidate) => candidate.id === fullProduct.rangeId);
  const rangeName = range?.name ?? '';
  const localized = localizeFields(
    {
      category: fullProduct.category,
      description: fullProduct.description,
      keyFeatures: fullProduct.keyFeatures,
      name: fullProduct.name,
      technicalDetails: fullProduct.technicalDetails,
    },
    fullProduct.translations,
    locale,
  );
  const assemblyNames = (kind: AssemblyKind) =>
    fullProduct.assemblies
      .filter((assembly) => assembly.kind === kind)
      .map((assembly) => localizeFields({ name: assembly.name }, assembly.translations, locale).name);

  // Keep the related strip in the same manual order as the catalog. Unready siblings are excluded so the
  // strip never links to a 404.
  const related = allProducts
    .filter(
      (candidate) =>
        candidate.rangeId === fullProduct.rangeId && candidate.id !== fullProduct.id && isLanderReady(candidate),
    )
    .sort(compareProductDisplayOrder)
    .map((candidate) => toCatalogProduct(candidate, locale));

  // getProduct returns assemblies already ordered (standard bucket first, then displayOrder), so filtering
  // by kind preserves display order within each list.
  return {
    id: fullProduct.id,
    name: localized.name,
    modelCode: fullProduct.modelCode,
    rangeName: localizeFields({ name: rangeName }, range?.translations, locale).name,
    rangeSlug: toRangeSlug(rangeName),
    // Analytics uses the Canonical Text slug so one Variant remains one reporting value across Locales.
    variant: toVariantSlug(range?.variants.find((variant) => variant.id === fullProduct.variantId)?.name),
    tagline: localized.category ?? '',
    description: localized.description ?? '',
    imageUrl: imageUrl(`/images/products/${fullProduct.id}`, fullProduct.images.primary?.updatedAt),
    ogImageUrl: imageUrl(`/images/products/${fullProduct.id}`, fullProduct.images.primary?.updatedAt, {
      format: OG_IMAGE_FORMAT,
    }),
    galleryImages: DETAIL_IMAGE_SLOTS.map((slot) => ({
      slot,
      imageUrl: productImageUrl(fullProduct.id, slot, fullProduct.images[slot]?.updatedAt),
    })) as ProductGalleryImages,
    // The hero highlight tiles render the Product's technical details (value is the bold headline, label
    // the small-caps caption). Lander readiness gates on at least one, so a visible Product always has tiles.
    highlights: localized.technicalDetails.map((detail) => ({
      value: detail.value,
      label: detail.label,
    })),
    standardAssemblies: assemblyNames('standard'),
    optionalAssemblies: assemblyNames('optional'),
    keyFeatures: localized.keyFeatures,
    brochureHref: isBrochureReady(fullProduct) ? brochureHref(fullProduct.id, locale) : null,
    related,
  };
}

function toVariantSlug(name: string | undefined): string | null {
  return name ? toRangeSlug(name) : null;
}

function brochureHref(productId: string, locale: Locale): string {
  const canonicalHref = `/downloads/products/${productId}/brochure`;

  return locale === CANONICAL_LOCALE ? canonicalHref : `${canonicalHref}?locale=${locale}`;
}

function productImageUrl(productId: string, slot: ProductImageSlot, updatedAt: string | null | undefined): string {
  return imageUrl(`/images/products/${productId}`, updatedAt, slot === 'primary' ? {} : { slot });
}
