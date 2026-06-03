import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

export type DocumentOwnerType = z.infer<typeof DocumentOwnerType>;
export const DocumentOwnerType = z.enum(['product', 'job', 'quote']);

export type DocumentFilename = z.infer<typeof DocumentFilename>;
export const DocumentFilename = requiredTrimmedText('Filename is required');

export type DocumentContentType = z.infer<typeof DocumentContentType>;
export const DocumentContentType = requiredTrimmedText('Content type is required');

export type DocumentByteSize = z.infer<typeof DocumentByteSize>;
export const DocumentByteSize = z.int().min(0);

export type ProductDocumentType = z.infer<typeof ProductDocumentType>;
export const ProductDocumentType = z.enum(['sop', 'part_book', 'brochure']);

export type ProductDocumentMetadata = z.infer<typeof ProductDocumentMetadata>;
export const ProductDocumentMetadata = z.object({
  type: ProductDocumentType,
});

export type QuoteDocumentMetadata = z.infer<typeof QuoteDocumentMetadata>;
export const QuoteDocumentMetadata = z.object({
  revision: z.int().min(1),
});

export type DocumentMetadata = z.infer<typeof DocumentMetadata>;
export const DocumentMetadata = z.union([ProductDocumentMetadata, QuoteDocumentMetadata]);

export type DocumentSummary = z.infer<typeof DocumentSummary>;
export const DocumentSummary = z.object({
  id: UUID,
  ownerType: DocumentOwnerType,
  jobId: UUID.nullable(),
  productId: UUID.nullable(),
  quoteId: UUID.nullable(),
  sourceProductId: UUID.nullable(),
  filename: DocumentFilename,
  contentType: DocumentContentType,
  byteSize: DocumentByteSize,
  metadata: DocumentMetadata,
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
  quoteId: z.null(),
  sourceProductId: UUID,
  sourceProductName: z.string().trim().min(1),
  metadata: ProductDocumentMetadata,
});

export type ProductDocument = z.infer<typeof ProductDocument>;
export const ProductDocument = DocumentSummary.extend({
  ownerType: z.literal('product'),
  jobId: z.null(),
  productId: UUID,
  quoteId: z.null(),
  sourceProductId: z.null(),
  metadata: ProductDocumentMetadata,
});

export type QuoteDocument = z.infer<typeof QuoteDocument>;
export const QuoteDocument = DocumentSummary.extend({
  ownerType: z.literal('quote'),
  jobId: z.null(),
  productId: z.null(),
  quoteId: UUID,
  sourceProductId: z.null(),
  metadata: QuoteDocumentMetadata,
});

export type DocumentListByProductInput = z.infer<typeof DocumentListByProductInput>;
export const DocumentListByProductInput = z.object({
  productId: UUID,
});

export type DocumentListByQuoteInput = z.infer<typeof DocumentListByQuoteInput>;
export const DocumentListByQuoteInput = z.object({
  quoteId: UUID,
});

export type ProductDocumentInput = z.infer<typeof ProductDocumentInput>;
export const ProductDocumentInput = z.object({
  documentId: UUID,
  productId: UUID,
});

export type QuoteDocumentInput = z.infer<typeof QuoteDocumentInput>;
export const QuoteDocumentInput = z.object({
  documentId: UUID,
  quoteId: UUID,
});

export type QuoteProductBrochureInput = z.infer<typeof QuoteProductBrochureInput>;
export const QuoteProductBrochureInput = z.object({
  documentId: UUID,
  quoteId: UUID,
});
