import { DOCUMENT_JPEG_CONTENT_TYPE, DOCUMENT_PNG_CONTENT_TYPE } from '../files/file-policy.js';

/** Meter photo limits shared by capture clients and the upload route. */
export const READING_PHOTO_POLICY = {
  allowedContentTypes: [DOCUMENT_JPEG_CONTENT_TYPE, DOCUMENT_PNG_CONTENT_TYPE],
  maxBytes: 10 * 1024 * 1024,
} as const;
