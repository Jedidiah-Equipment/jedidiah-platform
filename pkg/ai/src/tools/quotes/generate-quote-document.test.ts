import * as quotesCore from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { QuoteDocument } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiContext } from '@/context.js';

import { generateQuoteDocumentDefinition } from './generate-quote-document.js';

const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000401';

const document = QuoteDocument.parse({
  byteSize: 1024,
  contentType: 'application/pdf',
  createdAt: '2026-07-10T08:00:00.000Z',
  filename: 'QUO-00008-rev-1.pdf',
  id: DOCUMENT_ID,
  jobId: null,
  metadata: { revision: 1 },
  ownerType: 'quote',
  productId: null,
  quoteId: QUOTE_ID,
  sourceProductId: null,
  uploaderEmail: 'sales@example.com',
  uploaderName: 'Sales User',
  uploaderUserId: 'test-user-id',
});

function createContext(): AiContext {
  return {
    access: createUserAccessSummary({ role: 'sales', userId: 'test-user-id' }),
    brochureRenderer: vi.fn(),
    db: {} as AiContext['db'],
    log: {} as AiContext['log'],
    quoteDocumentRenderer: vi.fn(),
    sendEmail: vi.fn(),
    session: {
      user: {
        assistantEnabled: true,
        email: 'sales@example.com',
        id: 'test-user-id',
      },
    },
    storage: {} as AiContext['storage'],
  } as unknown as AiContext;
}

describe('generateQuoteDocument contract', () => {
  test('persists a Quote Document and returns a reusable email attachment reference', async () => {
    const ctx = createContext();
    const generateSpy = vi.spyOn(quotesCore, 'generateQuoteDocument').mockResolvedValue({
      document,
      warnings: [],
    });

    await expect(
      generateQuoteDocumentDefinition.handler({ leadTime: '14 working days', quoteId: QUOTE_ID }, ctx),
    ).resolves.toEqual({
      attachment: { documentId: DOCUMENT_ID, quoteId: QUOTE_ID, type: 'quoteDocument' },
      document,
      links: { download: `/api/quotes/${QUOTE_ID}/documents/${DOCUMENT_ID}/download` },
      warnings: [],
    });

    expect(generateSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      brochureRenderer: ctx.brochureRenderer,
      db: ctx.db,
      input: { leadTime: '14 working days', quoteId: QUOTE_ID },
      pdfRenderer: ctx.quoteDocumentRenderer,
      storage: ctx.storage,
    });
    expect(generateQuoteDocumentDefinition.anyOfPermissions).toEqual(['quote:update']);
    expect(() => z.toJSONSchema(generateQuoteDocumentDefinition.inputSchema)).not.toThrow();
  });
});
