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

export type DocumentMetadata = z.infer<typeof DocumentMetadata>;
export const DocumentMetadata = z.object({
  id: UUID,
  ownerType: DocumentOwnerType,
  jobId: UUID.nullable(),
  productId: UUID.nullable(),
  sourceProductId: UUID.nullable(),
  filename: DocumentFilename,
  contentType: DocumentContentType,
  byteSize: DocumentByteSize,
  uploaderUserId: AuthId,
  uploaderName: z.string().trim().min(1).nullable(),
  uploaderEmail: z.email().nullable(),
  createdAt: DateIso,
});

export type JobDocument = z.infer<typeof JobDocument>;
export const JobDocument = DocumentMetadata.extend({
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
