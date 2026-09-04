import { IMAGE_CONTENT_TYPES } from '@pkg/schema';
import { RANGE_LOGO_MAX_BYTES } from '@pkg/schema/equipment';

import type { FilePolicy } from '../../files/file-policy.js';

// Product Range brochure logos accept the shared image formats with a Range-specific size cap. Pass this
// to the generic `validateFile` / stored-file service.
export const RANGE_LOGO_POLICY: FilePolicy = {
  allowedContentTypes: IMAGE_CONTENT_TYPES,
  maxBytes: RANGE_LOGO_MAX_BYTES,
};
