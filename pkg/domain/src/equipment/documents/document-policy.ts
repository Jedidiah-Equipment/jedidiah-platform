import type { DocumentOwnerType, JobDocumentType } from '@pkg/schema';
import {
  JobDocumentMetadata,
  ProductDocumentMetadata,
  PurchaseOrderDocumentMetadata,
  QuoteDocumentMetadata,
} from '@pkg/schema';
import type { ZodType } from 'zod';

import {
  DOCUMENT_PDF_CONTENT_TYPE,
  DOCUMENT_ZIP_CONTENT_TYPE,
  documentContentTypeLabel,
  formatBytes,
} from '../../files/file-policy.js';

export {
  DOCUMENT_JPEG_CONTENT_TYPE,
  DOCUMENT_PDF_CONTENT_TYPE,
  DOCUMENT_PNG_CONTENT_TYPE,
  DOCUMENT_WEBP_CONTENT_TYPE,
  DOCUMENT_ZIP_CONTENT_TYPE,
  sniffDocumentContentType,
} from '../../files/file-policy.js';

export const JOB_DOCUMENT_TYPE_LABELS = {
  bom: 'BOM',
  brochure: 'Brochure',
  drawing: 'Drawing',
  general: 'General',
  part_book: 'Part Book',
  purchase_order: 'Purchase Order',
  sop: 'SOP',
} as const satisfies Record<JobDocumentType, string>;

export const PRODUCT_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;

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
  purchase_order: {
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
    metadataSchema: PurchaseOrderDocumentMetadata,
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
