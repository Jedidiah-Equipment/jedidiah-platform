import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { QuoteDocument } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';

import { generateQuoteDocumentDefinition } from '../quotes/generate-quote-document.js';
import { sendEmailDefinition } from './send-email.js';

const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000401';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';

const document = QuoteDocument.parse({
  byteSize: 3,
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

function createContext(): AiV2Context {
  return {
    access: createUserAccessSummary({ role: 'sales', userId: 'test-user-id' }),
    brochureRenderer: vi.fn(),
    db: {} as AiV2Context['db'],
    log: {} as AiV2Context['log'],
    quoteDocumentRenderer: vi.fn(),
    sendEmail: vi.fn(async () => undefined),
    session: {
      user: {
        assistantEnabled: true,
        email: 'sales@example.com',
        id: 'test-user-id',
      },
    },
    storage: {} as AiV2Context['storage'],
  } as AiV2Context;
}

describe('sendEmail v2 contract', () => {
  test('sends an AI-authored email to the actor with a persisted Quote Document attached', async () => {
    const ctx = createContext();
    vi.spyOn(core, 'readQuoteDocument').mockResolvedValue({
      document,
      object: {
        body: (async function* () {
          yield new Uint8Array([1, 2]);
          yield new Uint8Array([3]);
        })(),
        byteSize: 3,
        contentType: 'application/pdf',
      },
    });

    await expect(
      sendEmailDefinition.handler(
        {
          attachments: [{ documentId: DOCUMENT_ID, quoteId: QUOTE_ID, type: 'quoteDocument' }],
          body: 'Hello Acme,\n\nPlease find the draft quote attached.',
          subject: 'Draft quote QUO-00008 — Acme Mining',
          to: { type: 'me' },
        },
        ctx,
      ),
    ).resolves.toEqual({
      attachmentFilenames: ['QUO-00008-rev-1.pdf'],
      subject: 'Draft quote QUO-00008 — Acme Mining',
      to: 'sales@example.com',
    });

    expect(ctx.sendEmail).toHaveBeenCalledWith({
      attachments: [
        {
          content: new Uint8Array([1, 2, 3]),
          contentType: 'application/pdf',
          filename: 'QUO-00008-rev-1.pdf',
        },
      ],
      body: 'Hello Acme,\n\nPlease find the draft quote attached.',
      subject: 'Draft quote QUO-00008 — Acme Mining',
      to: 'sales@example.com',
    });
    expect(sendEmailDefinition.anyOfPermissions).toEqual(['email:send']);
    expect(() => z.toJSONSchema(sendEmailDefinition.inputSchema)).not.toThrow();
  });

  test('renders and sends a Product Brochure to an explicitly selected recipient', async () => {
    const ctx = createContext();
    const renderSpy = vi.spyOn(core, 'renderProductBrochurePreview').mockResolvedValue({
      bytes: new Uint8Array([4, 5, 6]),
      filename: 'JED-20-brochure.pdf',
    });

    await expect(
      sendEmailDefinition.handler(
        {
          attachments: [{ productId: PRODUCT_ID, type: 'productBrochureDocument' }],
          body: 'Please find the brochure attached.',
          subject: 'JED-20 Product Brochure',
          to: { email: 'Customer@Example.com', type: 'email' },
        },
        ctx,
      ),
    ).resolves.toEqual({
      attachmentFilenames: ['JED-20-brochure.pdf'],
      subject: 'JED-20 Product Brochure',
      to: 'customer@example.com',
    });

    expect(renderSpy).toHaveBeenCalledWith({
      db: ctx.db,
      pdfRenderer: ctx.brochureRenderer,
      productId: PRODUCT_ID,
      storage: ctx.storage,
    });
    expect(ctx.sendEmail).toHaveBeenCalledWith({
      attachments: [
        {
          content: new Uint8Array([4, 5, 6]),
          contentType: 'application/pdf',
          filename: 'JED-20-brochure.pdf',
        },
      ],
      body: 'Please find the brochure attached.',
      subject: 'JED-20 Product Brochure',
      to: 'customer@example.com',
    });
  });

  test('rechecks attachment-specific read access before sending', async () => {
    const ctx = createContext();
    ctx.access = {
      permissions: ['email:send'],
      role: 'sales',
      userId: 'test-user-id',
    };

    await expect(
      sendEmailDefinition.handler(
        {
          attachments: [{ documentId: DOCUMENT_ID, quoteId: QUOTE_ID, type: 'quoteDocument' }],
          body: 'Please find the document attached.',
          subject: 'Document',
          to: { type: 'me' },
        },
        ctx,
      ),
    ).rejects.toThrow('permission to attach Quote Documents');

    expect(ctx.sendEmail).not.toHaveBeenCalled();
  });

  test('supports the generate-then-send workflow for a draft Quote email', async () => {
    const ctx = createContext();
    vi.spyOn(core, 'generateQuoteDocument').mockResolvedValue({ document, warnings: [] });
    vi.spyOn(core, 'readQuoteDocument').mockResolvedValue({
      document,
      object: {
        body: (async function* () {
          yield new Uint8Array([1, 2, 3]);
        })(),
        byteSize: 3,
        contentType: 'application/pdf',
      },
    });

    const generated = await generateQuoteDocumentDefinition.handler(
      { leadTime: '14 working days', quoteId: QUOTE_ID },
      ctx,
    );
    const sent = await sendEmailDefinition.handler(
      {
        attachments: [generated.attachment],
        body: 'Hello Acme,\n\nPlease find the draft quote attached.',
        subject: 'Draft quote QUO-00008 — Acme Mining',
        to: { type: 'me' },
      },
      ctx,
    );

    expect(sent).toEqual({
      attachmentFilenames: ['QUO-00008-rev-1.pdf'],
      subject: 'Draft quote QUO-00008 — Acme Mining',
      to: 'sales@example.com',
    });
  });
});
