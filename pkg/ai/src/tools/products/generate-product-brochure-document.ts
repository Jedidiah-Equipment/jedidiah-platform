import * as productsCore from '@pkg/core';
import {
  createProductBrochureDownloadHref,
  DocumentByteSize,
  DocumentFilename,
  InternalAppHref,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';
import type { AiContext } from '@/context.js';
import { ProductBrochureDocumentAttachment } from '@/generated-document.js';

export type GenerateProductBrochureDocumentInput = z.infer<typeof GenerateProductBrochureDocumentInput>;
export const GenerateProductBrochureDocumentInput = z.object({ productId: UUID }).strict();

export type GenerateProductBrochureDocumentResponse = z.infer<typeof GenerateProductBrochureDocumentResponse>;
export const GenerateProductBrochureDocumentResponse = z.object({
  attachment: ProductBrochureDocumentAttachment,
  byteSize: DocumentByteSize,
  filename: DocumentFilename,
  links: z.object({ download: InternalAppHref }),
});

export const generateProductBrochureDocumentDefinition = {
  name: 'generateProductBrochureDocument',
  description: [
    'Generate the live PDF Brochure for one Product without persisting a new Product Document.',
    'Use findProducts first when the Product UUID is not already known.',
    'The Product Brochure must be fully configured; incomplete brochure configuration is rejected.',
    'Returns an attachment reference that can be copied unchanged into sendEmail. The brochure is rendered again from current Product data when sent.',
  ].join('\n'),
  inputSchema: GenerateProductBrochureDocumentInput,
  outputSchema: GenerateProductBrochureDocumentResponse,
  anyOfPermissions: ['product:read', 'quote:create'],
  async handler(args: unknown, ctx: AiContext): Promise<GenerateProductBrochureDocumentResponse> {
    const input = GenerateProductBrochureDocumentInput.parse(args);
    const brochure = await productsCore.renderProductBrochurePreview({
      db: ctx.db,
      pdfRenderer: ctx.brochureRenderer,
      productId: input.productId,
      storage: ctx.storage,
    });

    return GenerateProductBrochureDocumentResponse.parse({
      attachment: { productId: input.productId, type: 'productBrochureDocument' },
      byteSize: brochure.bytes.byteLength,
      filename: brochure.filename,
      links: { download: createProductBrochureDownloadHref(input.productId) },
    });
  },
} as const;
