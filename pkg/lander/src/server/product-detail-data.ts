import { getProduct, listProductRanges } from '@pkg/core';
import type { Db } from '@pkg/db';
import { evaluateBrochureCompleteness } from '@pkg/domain';
import { UUID } from '@pkg/schema';

import { type CatalogProduct, toCatalogProduct, toRangeSlug } from './products-data.js';

export type ProductHighlight = { value: string; label: string };

export type ProductDetail = {
  id: string;
  name: string;
  modelCode: string;
  rangeName: string;
  rangeSlug: string;
  tagline: string;
  description: string;
  imageUrl: string;
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

// Loads the Product detail view model by model code, or null when none matches (the route turns null into
// a 404). Reads stay in the lander's proven subset — plain `findMany` column reads, filtered in memory —
// because the relational `where`/`with` form clashes with the package's drizzle-orm type resolution. The
// marketing catalog is small, so loading it whole is cheap; pricing and bays are intentionally not read.
export async function loadProductDetail(db: Db, modelCode: string): Promise<ProductDetail | null> {
  const rows = await db.query.products.findMany({
    columns: {
      id: true,
      name: true,
      modelCode: true,
      description: true,
      brochureSubtitle: true,
      brochureKeyFeatures: true,
      rangeId: true,
    },
  });

  const product = rows.find((row) => row.modelCode === modelCode);
  if (!product) {
    return null;
  }

  // The full Product read (typed @pkg/core service) backs the brochure-completeness gate: it carries the
  // brochure config images/subtitle/key features the proven-safe column reads here cannot resolve cleanly.
  const [{ ranges }, assemblies, fullProduct] = await Promise.all([
    listProductRanges({ db }),
    db.query.productAssemblies.findMany({
      columns: { productId: true, kind: true, name: true, displayOrder: true },
    }),
    getProduct({ db, id: UUID.parse(product.id) }),
  ]);

  const brochureComplete = evaluateBrochureCompleteness({
    assemblyCount: fullProduct.assemblies.length,
    description: fullProduct.description,
    images: fullProduct.brochureConfig.images,
    keyFeatures: fullProduct.brochureConfig.keyFeatures,
    subtitle: fullProduct.brochureConfig.subtitle,
  }).complete;

  const range = ranges.find((candidate) => candidate.id === product.rangeId);
  const rangeName = range?.name ?? '';

  const productAssemblies = assemblies
    .filter((assembly) => assembly.productId === product.id)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // Other Products in the same Range, sorted by name like the catalog so the related strip is deterministic.
  const related = rows
    .filter((row) => row.rangeId === product.rangeId && row.id !== product.id)
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id))
    .map(toCatalogProduct);

  return {
    id: product.id,
    name: product.name,
    modelCode: product.modelCode,
    rangeName,
    rangeSlug: toRangeSlug(rangeName),
    tagline: product.brochureSubtitle ?? '',
    description: product.description ?? '',
    imageUrl: `/images/products/${product.id}`,
    highlights: HIGHLIGHT_PLACEHOLDERS,
    standardAssemblies: productAssemblies.filter((a) => a.kind === 'standard').map((a) => a.name),
    optionalAssemblies: productAssemblies.filter((a) => a.kind === 'optional').map((a) => a.name),
    keyFeatures: product.brochureKeyFeatures,
    brochureHref: brochureComplete ? `/downloads/products/${product.id}/brochure` : null,
    related,
  };
}
