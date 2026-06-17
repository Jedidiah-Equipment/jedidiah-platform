import { BROCHURE_IMAGE_MAX_BYTES, IMAGE_CONTENT_TYPES } from '@pkg/schema';

import type { ImagePolicy } from '../images/image-policy.js';

// Brochure slots accept the shared image formats with a Brochure-specific size cap. Pass this to the
// generic `validateImage` / image service.
export const BROCHURE_IMAGE_POLICY: ImagePolicy = {
  allowedContentTypes: IMAGE_CONTENT_TYPES,
  maxBytes: BROCHURE_IMAGE_MAX_BYTES,
};
