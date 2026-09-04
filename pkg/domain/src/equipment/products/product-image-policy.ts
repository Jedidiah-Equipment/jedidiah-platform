import { IMAGE_CONTENT_TYPES } from '@pkg/schema';
import { PRODUCT_IMAGE_MAX_BYTES } from '@pkg/schema/equipment';

import type { FilePolicy } from '../../files/file-policy.js';

// Product image slots accept the shared image formats with a Product-specific size cap. Pass this to the
// generic `validateFile` / stored-file service.
export const PRODUCT_IMAGE_POLICY: FilePolicy = {
  allowedContentTypes: IMAGE_CONTENT_TYPES,
  maxBytes: PRODUCT_IMAGE_MAX_BYTES,
};
