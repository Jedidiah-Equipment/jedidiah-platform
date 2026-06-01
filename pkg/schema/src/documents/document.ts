import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { requiredTrimmedText } from '../common/text.js';
import { UUID } from '../common/uuid.js';

export type DocumentOwnerType = z.infer<typeof DocumentOwnerType>;
export const DocumentOwnerType = z.enum(['product']);

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
  productId: UUID.nullable(),
  filename: DocumentFilename,
  contentType: DocumentContentType,
  byteSize: DocumentByteSize,
  uploaderUserId: AuthId,
  uploaderName: z.string().trim().min(1).nullable(),
  uploaderEmail: z.email().nullable(),
  createdAt: DateIso,
});

export type DocumentListByProductInput = z.infer<typeof DocumentListByProductInput>;
export const DocumentListByProductInput = z.object({
  productId: UUID,
});

export type DocumentDownloadInput = z.infer<typeof DocumentDownloadInput>;
export const DocumentDownloadInput = z.object({
  id: UUID,
});

export type DocumentDeleteInput = z.infer<typeof DocumentDeleteInput>;
export const DocumentDeleteInput = z.object({
  id: UUID,
});
