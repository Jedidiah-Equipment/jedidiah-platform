import { IMAGE_CONTENT_TYPES } from '@pkg/schema';

import {
  DOCUMENT_JPEG_CONTENT_TYPE,
  DOCUMENT_PDF_CONTENT_TYPE,
  DOCUMENT_PNG_CONTENT_TYPE,
  DOCUMENT_WEBP_CONTENT_TYPE,
  formatBytes,
  sniffDocumentContentType,
} from '../documents/document-policy.js';

// Per-feature upload rules for stored images. Compose one of these where an entity owns images and pass
// it to {@link validateImage}; the entity decides its allowed formats and size cap.
export type ImagePolicy = {
  allowedContentTypes: readonly string[];
  maxBytes: number;
};

export type ImagePolicyViolationCode = 'image.content_type_not_allowed' | 'image.file_too_large';

export type ImageValidationResult =
  | { ok: true; byteSize: number; contentType: string }
  | { ok: false; code: ImagePolicyViolationCode; message: string };

const CONTENT_TYPE_LABELS: Record<string, string> = {
  [DOCUMENT_PDF_CONTENT_TYPE]: 'PDF',
  [DOCUMENT_PNG_CONTENT_TYPE]: 'PNG',
  [DOCUMENT_JPEG_CONTENT_TYPE]: 'JPEG',
  [DOCUMENT_WEBP_CONTENT_TYPE]: 'WebP',
};

// Validate uploaded image bytes against a policy: the format is decided by sniffing the magic bytes
// (not the client-declared content type) and must be in the policy, and the byte length must be within
// the cap. Mirrors the document policy's content sniffing so a renamed or mislabeled file is rejected.
export function validateImage(bytes: Uint8Array, policy: ImagePolicy): ImageValidationResult {
  const sniffed = sniffDocumentContentType(bytes);

  if (!sniffed || !policy.allowedContentTypes.includes(sniffed)) {
    return {
      ok: false,
      code: 'image.content_type_not_allowed',
      message: imageContentTypeRejectedMessage(policy.allowedContentTypes),
    };
  }

  if (bytes.byteLength > policy.maxBytes) {
    return {
      ok: false,
      code: 'image.file_too_large',
      message: imageTooLargeMessage(policy.maxBytes),
    };
  }

  return { ok: true, byteSize: bytes.byteLength, contentType: sniffed };
}

// Canonical user-facing rejection messages, shared by `validateImage` (server, sniffed bytes) and the
// browser-side pre-upload guards so a rejected file reads identically wherever it is caught.
export function imageContentTypeRejectedMessage(contentTypes: readonly string[]): string {
  return `Only ${describeImageContentTypes(contentTypes)} files can be uploaded.`;
}

export function imageTooLargeMessage(maxBytes: number): string {
  return `File must be ${formatBytes(maxBytes)} or smaller.`;
}

// Comma/`or`-joined human label for a set of image content types, e.g. "PNG or JPEG".
export function describeImageContentTypes(contentTypes: readonly string[]): string {
  const labels = contentTypes.map((contentType) => CONTENT_TYPE_LABELS[contentType] ?? contentType);

  if (labels.length <= 1) {
    return labels[0] ?? '';
  }

  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

// `accept` attribute value for a file input constrained to the shared image formats.
export const IMAGE_ACCEPT = IMAGE_CONTENT_TYPES.join(',');
