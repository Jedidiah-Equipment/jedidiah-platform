import { IMAGE_CONTENT_TYPES, RANGE_IMAGE_MAX_BYTES } from '@pkg/schema';

import type { FilePolicy } from '../files/file-policy.js';

// Product Range presentation images accept the shared image formats with a Range-specific size cap. Pass
// this to the generic `validateFile` / stored-file service.
export const RANGE_IMAGE_POLICY: FilePolicy = {
  allowedContentTypes: IMAGE_CONTENT_TYPES,
  maxBytes: RANGE_IMAGE_MAX_BYTES,
};
