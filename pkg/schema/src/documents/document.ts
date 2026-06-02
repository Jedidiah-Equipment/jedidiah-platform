import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

export type DocumentOwnerType = z.infer<typeof DocumentOwnerType>;
export const DocumentOwnerType = z.enum(['product', 'job']);

export type DocumentFilename = z.infer<typeof DocumentFilename>;
export const DocumentFilename = requiredTrimmedText('Filename is required');

export type DocumentContentType = z.infer<typeof DocumentContentType>;
export const DocumentContentType = requiredTrimmedText('Content type is required');

export type DocumentByteSize = z.infer<typeof DocumentByteSize>;
export const DocumentByteSize = z.int().min(0);

export type ProductDocumentType = z.infer<typeof ProductDocumentType>;
export const ProductDocumentType = z.enum(['sop', 'part_book', 'brochure']);

export const PRODUCT_DOCUMENT_TYPE_LABELS = {
  brochure: 'Brochure',
  part_book: 'Part Book',
  sop: 'SOP',
} as const satisfies Record<ProductDocumentType, string>;

export type ProductDocumentMetadata = z.infer<typeof ProductDocumentMetadata>;
export const ProductDocumentMetadata = z.object({
  type: ProductDocumentType,
});

export type DocumentSummary = z.infer<typeof DocumentSummary>;
export const DocumentSummary = z.object({
  id: UUID,
  ownerType: DocumentOwnerType,
  jobId: UUID.nullable(),
  productId: UUID.nullable(),
  sourceProductId: UUID.nullable(),
  filename: DocumentFilename,
  contentType: DocumentContentType,
  byteSize: DocumentByteSize,
  metadata: ProductDocumentMetadata,
  uploaderUserId: AuthId,
  uploaderName: z.string().trim().min(1).nullable(),
  uploaderEmail: z.email().nullable(),
  createdAt: DateIso,
});

export type JobDocument = z.infer<typeof JobDocument>;
export const JobDocument = DocumentSummary.extend({
  ownerType: z.literal('job'),
  jobId: UUID,
  productId: z.null(),
  sourceProductId: UUID,
  sourceProductName: z.string().trim().min(1),
});

export type DocumentListByProductInput = z.infer<typeof DocumentListByProductInput>;
export const DocumentListByProductInput = z.object({
  productId: UUID,
});

export type ProductDocumentInput = z.infer<typeof ProductDocumentInput>;
export const ProductDocumentInput = z.object({
  documentId: UUID,
  productId: UUID,
});
