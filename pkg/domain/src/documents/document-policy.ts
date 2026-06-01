import type { DocumentOwnerType } from '@pkg/schema';

export const DOCUMENT_PDF_CONTENT_TYPE = 'application/pdf';
export const PRODUCT_DOCUMENT_MAX_BYTES = 100 * 1024 * 1024;

export type DocumentPolicy = {
  allowedContentTypes: readonly string[];
  maxBytes: number;
};

export type DocumentPolicyViolationCode = 'document.content_type_not_allowed' | 'document.file_too_large';

export type DocumentPolicyValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: DocumentPolicyViolationCode;
      message: string;
    };

export const documentPolicies = {
  product: {
    allowedContentTypes: [DOCUMENT_PDF_CONTENT_TYPE],
    maxBytes: PRODUCT_DOCUMENT_MAX_BYTES,
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
      message: 'Only PDF documents can be uploaded.',
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

export function formatBytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
