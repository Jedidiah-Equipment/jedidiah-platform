import {
  BROCHURE_IMAGE_SLOTS,
  type BrochureCompleteness,
  type BrochureRequiredField,
  type Product,
  type ProductImages,
} from '@pkg/schema';

// The inputs the brochure-completeness verdict is computed from: the Product marketing fields (category,
// key features, the brochure image slots) plus the owning Product's description and assembly count. Kept
// as a flat, framework-free shape so the same predicate runs on the server (Product read assembly) and in
// the browser (live form alert).
export type BrochureCompletenessInput = {
  assemblyCount: number;
  category: string | null;
  description: string | null;
  images: ProductImages;
  keyFeatures: readonly string[];
};

// Pure single source of truth for whether a Product Brochure is ready. Required = the marketing fields
// (category, at least one key feature, the brochure image slots) + a non-empty Product description + at
// least one assembly. Returns the complete/incomplete verdict and the exact still-missing fields, reported
// in {@link BROCHURE_REQUIRED_FIELDS} order. Reused by the form alert, the preview gate, and the quote/job
// generation gate.
export function evaluateBrochureCompleteness(input: BrochureCompletenessInput): BrochureCompleteness {
  const missingFields: BrochureRequiredField[] = [];

  if (!hasText(input.category)) {
    missingFields.push('category');
  }

  if (!input.keyFeatures.some(hasText)) {
    missingFields.push('keyFeatures');
  }

  for (const slot of BROCHURE_IMAGE_SLOTS) {
    if (!input.images[slot]) {
      missingFields.push(slot);
    }
  }

  if (!hasText(input.description)) {
    missingFields.push('description');
  }

  if (input.assemblyCount < 1) {
    missingFields.push('assemblies');
  }

  return { complete: missingFields.length === 0, missingFields };
}

// Adapts a persisted Product into the completeness verdict. The single home for the Product → input
// mapping so the preview gate, the quote/job generation gate, and the Lander stay in lockstep when the
// required-field shape changes.
export function evaluateProductBrochureCompleteness(product: Product): BrochureCompleteness {
  return evaluateBrochureCompleteness({
    assemblyCount: product.assemblies.length,
    category: product.category,
    description: product.description,
    images: product.images,
    keyFeatures: product.keyFeatures,
  });
}

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
