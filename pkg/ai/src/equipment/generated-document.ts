import { UUID } from '@pkg/schema';
import { z } from 'zod';

export type QuoteDocumentAttachment = z.infer<typeof QuoteDocumentAttachment>;
export const QuoteDocumentAttachment = z
  .object({
    documentId: UUID,
    quoteId: UUID,
    type: z.literal('quoteDocument'),
  })
  .strict();

export type ProductBrochureDocumentAttachment = z.infer<typeof ProductBrochureDocumentAttachment>;
export const ProductBrochureDocumentAttachment = z
  .object({
    productId: UUID,
    type: z.literal('productBrochureDocument'),
  })
  .strict();

export type GeneratedDocumentAttachment = z.infer<typeof GeneratedDocumentAttachment>;
export const GeneratedDocumentAttachment = z.discriminatedUnion('type', [
  QuoteDocumentAttachment,
  ProductBrochureDocumentAttachment,
]);
