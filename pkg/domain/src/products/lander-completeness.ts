import {
  LANDER_IMAGE_SLOTS,
  type LanderCompleteness,
  type LanderRequiredField,
  type Product,
  type ProductImages,
} from '@pkg/schema';

// The inputs the lander-completeness verdict is computed from: the Product marketing fields, lander gallery
// image slots, and standard-assembly count. Kept as a flat, framework-free shape so the same predicate runs
// on the server (public lander gates) and in the browser (form readiness aside).
export type LanderCompletenessInput = {
  category: string | null;
  description: string | null;
  images: ProductImages;
  keyFeatures: readonly string[];
  standardAssemblyCount: number;
};

// Preserve the schema-defined field order; this verdict drives both public routes and the form readiness UI.
export function evaluateLanderCompleteness(input: LanderCompletenessInput): LanderCompleteness {
  const missingFields: LanderRequiredField[] = [];

  if (!hasText(input.category)) {
    missingFields.push('category');
  }

  if (!input.keyFeatures.some(hasText)) {
    missingFields.push('keyFeatures');
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
