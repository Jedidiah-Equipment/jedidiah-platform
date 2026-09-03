export const DOCUMENT_PDF_CONTENT_TYPE = 'application/pdf';
export const DOCUMENT_PNG_CONTENT_TYPE = 'image/png';
export const DOCUMENT_JPEG_CONTENT_TYPE = 'image/jpeg';
export const DOCUMENT_WEBP_CONTENT_TYPE = 'image/webp';
export const DOCUMENT_ZIP_CONTENT_TYPE = 'application/zip';
export const DOCUMENT_CONTENT_TYPE_LABELS = {
  [DOCUMENT_JPEG_CONTENT_TYPE]: 'JPEG',
  [DOCUMENT_PDF_CONTENT_TYPE]: 'PDF',
  [DOCUMENT_PNG_CONTENT_TYPE]: 'PNG',
  [DOCUMENT_WEBP_CONTENT_TYPE]: 'WebP',
  [DOCUMENT_ZIP_CONTENT_TYPE]: 'ZIP',
} as const;

const PDF_MAGIC_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PNG_MAGIC_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);
const WEBP_RIFF_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const WEBP_FORMAT_BYTES = new Uint8Array([0x57, 0x45, 0x42, 0x50]);
// ZIP archives may begin with a local file header, an empty-archive marker, or a spanned-archive marker.
const ZIP_MAGIC_BYTES = [
  new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
  new Uint8Array([0x50, 0x4b, 0x05, 0x06]),
  new Uint8Array([0x50, 0x4b, 0x07, 0x08]),
] as const;

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
  const labels = contentTypes.map(documentContentTypeLabel);

  if (labels.length <= 1) {
    return labels[0] ?? '';
  }

  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;
}

export function sniffDocumentContentType(bytes: Uint8Array): string | null {
  if (startsWithBytes(bytes, PDF_MAGIC_BYTES)) {
    return DOCUMENT_PDF_CONTENT_TYPE;
  }

  if (startsWithBytes(bytes, PNG_MAGIC_BYTES)) {
    return DOCUMENT_PNG_CONTENT_TYPE;
  }

  if (startsWithBytes(bytes, JPEG_MAGIC_BYTES)) {
    return DOCUMENT_JPEG_CONTENT_TYPE;
  }

  if (startsWithBytes(bytes, WEBP_RIFF_BYTES) && startsWithBytes(bytes.subarray(8), WEBP_FORMAT_BYTES)) {
    return DOCUMENT_WEBP_CONTENT_TYPE;
  }

  if (ZIP_MAGIC_BYTES.some((signature) => startsWithBytes(bytes, signature))) {
    return DOCUMENT_ZIP_CONTENT_TYPE;
  }

  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    const kilobytes = bytes / 1024;

    return `${Number.isInteger(kilobytes) ? kilobytes : kilobytes.toFixed(1)} KB`;
  }

  const megabytes = bytes / (1024 * 1024);

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

export function documentContentTypeLabel(contentType: string): string {
  return DOCUMENT_CONTENT_TYPE_LABELS[contentType as keyof typeof DOCUMENT_CONTENT_TYPE_LABELS] ?? contentType;
}

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) {
    return false;
  }

  return prefix.every((byte, index) => bytes[index] === byte);
}
