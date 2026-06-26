import { IMAGE_CONTENT_TYPES } from '@pkg/schema';

// `accept` attribute value for a file input constrained to the shared image formats.
export const IMAGE_ACCEPT = IMAGE_CONTENT_TYPES.join(',');
