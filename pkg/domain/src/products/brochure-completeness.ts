import {
  BROCHURE_IMAGE_SLOTS,
  type BrochureCompleteness,
  type BrochureImages,
  type BrochureRequiredField,
} from '@pkg/schema';

// The inputs the brochure-completeness verdict is computed from: the Brochure Config (subtitle, key
// features, the four image slots) plus the owning Product's description and assembly count. Kept as a
// flat, framework-free shape so the same predicate runs on the server (Product read assembly) and in
// the browser (live form alert).
export type BrochureCompletenessInput = {
  assemblyCount: number;
  description: string | null;
  images: BrochureImages;
  keyFeatures: readonly string[];
  subtitle: string | null;
};

// Pure single source of truth for whether a Product Brochure is ready. Required = all six Brochure
// Config fields (subtitle, at least one key feature, the four images) + a non-empty Product description
// + at least one assembly. Returns the complete/incomplete verdict and the exact still-missing fields,
// reported in {@link BROCHURE_REQUIRED_FIELDS} order. Reused by the form alert, the preview gate, and the
// quote/job generation gate.
export function evaluateBrochureCompleteness(input: BrochureCompletenessInput): BrochureCompleteness {
  const missingFields: BrochureRequiredField[] = [];

  if (!hasText(input.subtitle)) {
    missingFields.push('subtitle');
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

function hasText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}
