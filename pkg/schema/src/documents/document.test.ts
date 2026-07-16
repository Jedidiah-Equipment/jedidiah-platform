import { describe, expect, it } from 'vitest';

import { JobDocument } from './document.js';

describe('JobDocument', () => {
  it('accepts an uploaded Purchase Order without a source Product', () => {
    expect(
      JobDocument.parse({
        byteSize: 8,
        contentType: 'application/pdf',
        createdAt: '2026-07-16T10:00:00.000Z',
        filename: 'PO-123.pdf',
        id: '11111111-1111-4111-8111-111111111111',
        jobId: '22222222-2222-4222-8222-222222222222',
        metadata: { type: 'purchase_order' },
        ownerType: 'job',
        productId: null,
        quoteId: null,
        sourceProductId: null,
        sourceProductName: null,
        uploaderEmail: 'buyer@example.com',
        uploaderName: 'Buyer',
        uploaderUserId: 'buyer-user-id',
      }),
    ).toMatchObject({
      metadata: { type: 'purchase_order' },
      sourceProductId: null,
      sourceProductName: null,
    });
  });
});
