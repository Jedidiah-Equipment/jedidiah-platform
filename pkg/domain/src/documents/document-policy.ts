import type { DocumentOwnerType, JobDocumentType } from '@pkg/schema';
import { JobDocumentMetadata, ProductDocumentMetadata, QuoteDocumentMetadata } from '@pkg/schema';
import type { ZodType } from 'zod';

export const JOB_DOCUMENT_TYPE_LABELS = {
  bom: 'BOM',
  brochure: 'Brochure',
  drawing: 'Drawing',
  general: 'General',
  part_book: 'Part Book',
  purchase_order: 'Purchase Order',
  sop: 'SOP',
} as const satisfies Record<JobDocumentType, string>;

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
export const PRODUCT_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;
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
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: JobDocumentMetadata,
  },
  product: {
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE, DOCUMENT_ZIP_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: ProductDocumentMetadata,
  },
  quote: {
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: QuoteDocumentMetadata,
  },
} as const satisfies Record<DocumentOwnerType, DocumentPolicy>;

export function getDocumentPolicy(ownerType: DocumentOwnerType, metadata?: unknown): DocumentPolicy {
  const policy = documentPolicies[ownerType];

  if (ownerType !== 'product') {
    return policy;
  }

  const parsedMetadata = ProductDocumentMetadata.safeParse(metadata);
  if (!parsedMetadata.success) {
    return policy;
  }

  return {
    ...policy,
    allowedContentTypes:
      parsedMetadata.data.type === 'drawing' ? [DOCUMENT_ZIP_CONTENT_TYPE] : [DOCUMENT_PDF_CONTENT_TYPE],
  };
}

export function validateDocumentPolicy(input: {
  byteSize: number;
  contentType: string;
  metadata?: unknown;
  ownerType: DocumentOwnerType;
}): DocumentPolicyValidationResult {
  const policy = getDocumentPolicy(input.ownerType, input.metadata);

  if (!policy.allowedContentTypes.includes(input.contentType)) {
    const [onlyContentType] = policy.allowedContentTypes;

    return {
      ok: false,
      code: 'document.content_type_not_allowed',
      message:
        policy.allowedContentTypes.length === 1 && onlyContentType
          ? `Only ${documentContentTypeLabel(onlyContentType)} documents can be uploaded.`
          : `Only ${policy.allowedContentTypes.map(documentContentTypeLabel).join(' or ')} documents can be uploaded.`,
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

function startsWithBytes(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.byteLength < prefix.byteLength) {
    return false;
  }

  return prefix.every((byte, index) => bytes[index] === byte);
}

export function documentContentTypeLabel(contentType: string): string {
  return DOCUMENT_CONTENT_TYPE_LABELS[contentType as keyof typeof DOCUMENT_CONTENT_TYPE_LABELS] ?? contentType;
}
