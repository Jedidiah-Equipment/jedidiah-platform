import * as productsCore from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

import type { AiV2Context } from '@/v2/context.js';

import { generateProductBrochureDocumentDefinition } from './generate-product-brochure-document.js';

const PRODUCT_ID = '00000000-0000-4000-8000-000000000201';

function createContext(): AiV2Context {
  return {
    access: createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }),
    brochureRenderer: vi.fn(),
    db: {} as AiV2Context['db'],
    log: {} as AiV2Context['log'],
    quoteDocumentRenderer: vi.fn(),
    sendEmail: vi.fn(),
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

describe('generateProductBrochureDocument v2 contract', () => {
  test('validates a live Product Brochure and returns a reusable email attachment reference', async () => {
    const ctx = createContext();
    const renderSpy = vi.spyOn(productsCore, 'renderProductBrochurePreview').mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      filename: 'JED-20-brochure.pdf',
    });

    await expect(generateProductBrochureDocumentDefinition.handler({ productId: PRODUCT_ID }, ctx)).resolves.toEqual({
      attachment: { productId: PRODUCT_ID, type: 'productBrochureDocument' },
      byteSize: 3,
      filename: 'JED-20-brochure.pdf',
      links: { download: `/api/products/${PRODUCT_ID}/brochure-preview` },
    });

    expect(renderSpy).toHaveBeenCalledWith({
      db: ctx.db,
      pdfRenderer: ctx.brochureRenderer,
      productId: PRODUCT_ID,
      storage: ctx.storage,
    });
    expect(generateProductBrochureDocumentDefinition.requiredPermission).toEqual(['product:read', 'quote:create']);
    expect(() => z.toJSONSchema(generateProductBrochureDocumentDefinition.inputSchema)).not.toThrow();
  });
});
