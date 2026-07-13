import * as quotesCore from '@pkg/core';
import {
  QuoteDocumentGenerationInput as CoreQuoteDocumentGenerationInput,
  QuoteDocument,
  QuoteDocumentGenerationWarning,
  QuoteDocumentLeadTime,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { requireAiActorId } from '@/actor.js';
import type { AiContext } from '@/context.js';
import { createQuoteDocumentDownloadHref, InternalAppHref } from '@/entity-links.js';
import { QuoteDocumentAttachment } from '@/generated-document.js';

export type GenerateQuoteDocumentInput = z.infer<typeof GenerateQuoteDocumentInput>;
export const GenerateQuoteDocumentInput = z
  .object({
    leadTime: QuoteDocumentLeadTime,
    quoteId: UUID,
  })
  .strict();

export type GenerateQuoteDocumentResponse = z.infer<typeof GenerateQuoteDocumentResponse>;
export const GenerateQuoteDocumentResponse = z.object({
  attachment: QuoteDocumentAttachment,
  document: QuoteDocument,
  links: z.object({ download: InternalAppHref }),
  warnings: z.array(QuoteDocumentGenerationWarning),
});

export const generateQuoteDocumentDefinition = {
  name: 'generateQuoteDocument',
  description: [
    'Generate and persist the next PDF revision for one Quote.',
    'Use findQuotes and getQuote first. Supply a truthful customer-facing lead time; use Product build-time facts when available and ask the user when it cannot be derived.',
    'Rejected and cancelled Quotes cannot generate documents.',
    'Returns an attachment reference that can be copied unchanged into sendEmail.',
  ].join('\n'),
  inputSchema: GenerateQuoteDocumentInput,
  outputSchema: GenerateQuoteDocumentResponse,
  anyOfPermissions: ['quote:update'],
  async handler(args: unknown, ctx: AiContext): Promise<GenerateQuoteDocumentResponse> {
    const input = CoreQuoteDocumentGenerationInput.parse(GenerateQuoteDocumentInput.parse(args));
    const result = await quotesCore.generateQuoteDocument({
      actorUserId: requireAiActorId(ctx),
      brochureRenderer: ctx.brochureRenderer,
      db: ctx.db,
      input,
      pdfRenderer: ctx.quoteDocumentRenderer,
      storage: ctx.storage,
    });

    return GenerateQuoteDocumentResponse.parse({
      ...result,
      attachment: {
        documentId: result.document.id,
        quoteId: result.document.quoteId,
        type: 'quoteDocument',
      },
      links: {
        download: createQuoteDocumentDownloadHref(result.document.quoteId, result.document.id),
      },
    });
  },
} as const;
