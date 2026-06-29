import {
  LANDER_IMAGE_SLOTS,
  type LanderCompleteness,
  type LanderRequiredField,
  type Product,
  type ProductImages,
  type ProductTechnicalDetail,
} from '@pkg/schema';

// The inputs the lander-completeness verdict is computed from: the Product marketing fields (category,
// key features, the lander gallery image slots) plus its description and standard-assembly count. Kept as a
// flat, framework-free shape so the same predicate runs on the server (public lander gates) and in the
// browser (form readiness aside).
export type LanderCompletenessInput = {
  category: string | null;
  description: string | null;
  images: ProductImages;
  keyFeatures: readonly string[];
  technicalDetails: readonly ProductTechnicalDetail[];
  standardAssemblyCount: number;
};

// Pure single source of truth for whether a Product Lander page is ready to publish. Required = category,
// at least one key feature, at least one technical detail (label + value), the lander gallery slots, a
// non-empty description, and at least one standard assembly. Returns the complete/incomplete verdict and
// the exact still-missing fields, reported in
// {@link LANDER_REQUIRED_FIELDS} order. Reused by the form aside and the public catalog/detail/related gates.
export function evaluateLanderCompleteness(input: LanderCompletenessInput): LanderCompleteness {
  const missingFields: LanderRequiredField[] = [];

  if (!hasText(input.category)) {
    missingFields.push('category');
  }

  if (!input.keyFeatures.some(hasText)) {
    missingFields.push('keyFeatures');
  }

  if (!input.technicalDetails.some((detail) => hasText(detail.label) && hasText(detail.value))) {
    missingFields.push('technicalDetails');
  }

  for (const slot of LANDER_IMAGE_SLOTS) {
    if (!input.images[slot]) {
      missingFields.push(slot);
    }
  }

  if (!hasText(input.description)) {
    missingFields.push('description');
  }

  if (input.standardAssemblyCount < 1) {
    missingFields.push('standardAssembly');
  }

  return { complete: missingFields.length === 0, missingFields };
}

// Adapts a persisted Product into the lander-completeness verdict. The single home for the Product → input
// mapping so the form aside and the public gates stay in lockstep when the required-field shape changes.
export function evaluateProductLanderCompleteness(product: Product): LanderCompleteness {
  return evaluateLanderCompleteness({
    category: product.category,
    description: product.description,
    images: product.images,
    keyFeatures: product.keyFeatures,
    technicalDetails: product.technicalDetails,
    standardAssemblyCount: product.assemblies.filter((assembly) => assembly.kind === 'standard').length,
  });
}

// Whether a Product Lander page is publicly ready: the publish toggle is on AND every required field is
// filled. Gates the public catalog card, detail page, and related strip.
export function isLanderReady(product: Product): boolean {
  return product.landerEnabled && evaluateProductLanderCompleteness(product).complete;
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
