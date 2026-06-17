import type { DocumentOwnerType, JobDocumentType } from '@pkg/schema';
import { ProductDocumentMetadata, QuoteDocumentMetadata } from '@pkg/schema';
import type { ZodType } from 'zod';

export const PRODUCT_DOCUMENT_TYPE_LABELS = {
  brochure: 'Brochure',
  part_book: 'Part Book',
  sop: 'SOP',
} as const satisfies Record<JobDocumentType, string>;

export const DOCUMENT_PDF_CONTENT_TYPE = 'application/pdf';
export const DOCUMENT_PNG_CONTENT_TYPE = 'image/png';
export const DOCUMENT_JPEG_CONTENT_TYPE = 'image/jpeg';
export const DOCUMENT_WEBP_CONTENT_TYPE = 'image/webp';
export const PRODUCT_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;
const PDF_MAGIC_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
const PNG_MAGIC_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC_BYTES = new Uint8Array([0xff, 0xd8, 0xff]);
const WEBP_RIFF_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
const WEBP_FORMAT_BYTES = new Uint8Array([0x57, 0x45, 0x42, 0x50]);

export type DocumentPolicy = {
  allowedContentTypes: readonly string[];
  maxBytes: number;
  metadataSchema: ZodType;
};

export type DocumentPolicyViolationCode =
  | 'document.content_type_not_allowed'
  | 'document.file_too_large'
  | 'document.metadata_invalid';

export type DocumentPolicyValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: DocumentPolicyViolationCode;
      message: string;
    };

export const documentPolicies = {
  job: {
    allowedContentTypes: [
      DOCUMENT_PDF_CONTENT_TYPE,
      DOCUMENT_PNG_CONTENT_TYPE,
      DOCUMENT_JPEG_CONTENT_TYPE,
      DOCUMENT_WEBP_CONTENT_TYPE,
    ],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: ProductDocumentMetadata,
  },
  product: {
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: ProductDocumentMetadata,
  },
  quote: {
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: QuoteDocumentMetadata,
  },
} as const satisfies Record<DocumentOwnerType, DocumentPolicy>;

export function getDocumentPolicy(ownerType: DocumentOwnerType): DocumentPolicy {
  return documentPolicies[ownerType];
}

export function validateDocumentPolicy(input: {
  byteSize: number;
  contentType: string;
  ownerType: DocumentOwnerType;
}): DocumentPolicyValidationResult {
  const policy = getDocumentPolicy(input.ownerType);

  if (!policy.allowedContentTypes.includes(input.contentType)) {
    return {
      ok: false,
      code: 'document.content_type_not_allowed',
      message:
        policy.allowedContentTypes.length === 1 && policy.allowedContentTypes[0] === DOCUMENT_PDF_CONTENT_TYPE
          ? 'Only PDF documents can be uploaded.'
          : 'Only PDF, PNG, JPEG, or WebP documents can be uploaded.',
    };
  }

  if (input.byteSize > policy.maxBytes) {
    return {
      ok: false,
      code: 'document.file_too_large',
      message: `Document must be ${formatBytes(policy.maxBytes)} or smaller.`,
    };
  }

  return { ok: true };
}

export function validateDocumentMetadata(input: {
  metadata: unknown;
  ownerType: DocumentOwnerType;
}): DocumentPolicyValidationResult {
  const policy = getDocumentPolicy(input.ownerType);

  if (!policy.metadataSchema.safeParse(input.metadata).success) {
    return {
      ok: false,
      code: 'document.metadata_invalid',
      message: 'Choose a valid document type.',
    };
  }

  return { ok: true };
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

  return null;
}

export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) {
    return false;
  }

  return prefix.every((byte, index) => bytes[index] === byte);
}
