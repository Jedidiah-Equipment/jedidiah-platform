import {
  DOCUMENT_JPEG_CONTENT_TYPE,
  DOCUMENT_PDF_CONTENT_TYPE,
  DOCUMENT_PNG_CONTENT_TYPE,
  DOCUMENT_WEBP_CONTENT_TYPE,
  formatBytes,
  sniffDocumentContentType,
} from '../documents/document-policy.js';

// Per-feature upload rules for stored files. Compose one of these where an entity owns uploaded files and
// pass it to {@link validateFile}; the entity decides its allowed formats and size cap. Content-type
// agnostic — the policy's `allowedContentTypes` is the single source of truth for what is accepted.
export type FilePolicy = {
  allowedContentTypes: readonly string[];
  maxBytes: number;
};

export type FilePolicyViolationCode = 'file.content_type_not_allowed' | 'file.too_large';

export type FileValidationResult =
  | { ok: true; byteSize: number; contentType: string }
  | { ok: false; code: FilePolicyViolationCode; message: string };

const CONTENT_TYPE_LABELS: Record<string, string> = {
  [DOCUMENT_PDF_CONTENT_TYPE]: 'PDF',
  [DOCUMENT_PNG_CONTENT_TYPE]: 'PNG',
  [DOCUMENT_JPEG_CONTENT_TYPE]: 'JPEG',
  [DOCUMENT_WEBP_CONTENT_TYPE]: 'WebP',
};

// Validate uploaded file bytes against a policy: the format is decided by sniffing the magic bytes
// (not the client-declared content type) and must be in the policy, and the byte length must be within
// the cap. Mirrors the document policy's content sniffing so a renamed or mislabeled file is rejected.
export function validateFile(bytes: Uint8Array, policy: FilePolicy): FileValidationResult {
  const sniffed = sniffDocumentContentType(bytes);

  if (!sniffed || !policy.allowedContentTypes.includes(sniffed)) {
    return {
      ok: false,
      code: 'file.content_type_not_allowed',
      message: fileContentTypeRejectedMessage(policy.allowedContentTypes),
    };
  }

  if (bytes.byteLength > policy.maxBytes) {
    return {
      ok: false,
      code: 'file.too_large',
      message: fileTooLargeMessage(policy.maxBytes),
    };
  }

  return { ok: true, byteSize: bytes.byteLength, contentType: sniffed };
}

// Canonical user-facing rejection messages, shared by `validateFile` (server, sniffed bytes) and the
// browser-side pre-upload guards so a rejected file reads identically wherever it is caught.
export function fileContentTypeRejectedMessage(contentTypes: readonly string[]): string {
  return `Only ${describeFileContentTypes(contentTypes)} files can be uploaded.`;
}

export function fileTooLargeMessage(maxBytes: number): string {
  return `File must be ${formatBytes(maxBytes)} or smaller.`;
}

// Comma/`or`-joined human label for a set of content types, e.g. "PNG or JPEG".
export function describeFileContentTypes(contentTypes: readonly string[]): string {
  const labels = contentTypes.map((contentType) => CONTENT_TYPE_LABELS[contentType] ?? contentType);

  if (labels.length <= 1) {
    return labels[0] ?? '';
  }

  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}
