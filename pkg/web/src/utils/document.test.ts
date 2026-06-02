import { DocumentMetadata, type UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { createDocumentDownloadPath, getDocumentPreviewKind } from './document.js';

const documentMetadata = DocumentMetadata.parse({
  byteSize: 128,
  contentType: 'application/pdf',
  createdAt: '2026-06-02T10:00:00.000Z',
  filename: 'Part Book.pdf',
  id: '11111111-1111-1111-8111-111111111111',
  jobId: null,
  ownerType: 'product',
  productId: '22222222-2222-2222-8222-222222222222',
  sourceProductId: null,
  uploaderEmail: 'test@example.com',
  uploaderName: 'Test User',
  uploaderUserId: 'test-user-id',
});

describe('document utilities', () => {
  it('builds the product-scoped document download path', () => {
    expect(
      createDocumentDownloadPath({
        document: documentMetadata,
        owner: {
          id: '22222222-2222-2222-8222-222222222222' as UUID,
          type: 'product',
        },
      }),
    ).toBe(
      '/api/products/22222222-2222-2222-8222-222222222222/documents/11111111-1111-1111-8111-111111111111/download',
    );
  });

  it('builds the job-scoped document download path', () => {
    expect(
      createDocumentDownloadPath({
        document: documentMetadata,
        owner: {
          id: '33333333-3333-3333-8333-333333333333' as UUID,
          type: 'job',
        },
      }),
    ).toBe('/api/jobs/33333333-3333-3333-8333-333333333333/documents/11111111-1111-1111-8111-111111111111/download');
  });

  it('classifies supported preview content types', () => {
    expect(getDocumentPreviewKind({ contentType: 'application/pdf' })).toBe('pdf');
    expect(getDocumentPreviewKind({ contentType: 'image/png' })).toBe('image');
    expect(getDocumentPreviewKind({ contentType: 'image/jpeg' })).toBe('image');
    expect(getDocumentPreviewKind({ contentType: 'image/webp' })).toBe('image');
  });

  it('returns null for unsupported preview content types', () => {
    expect(getDocumentPreviewKind({ contentType: 'text/plain' })).toBeNull();
  });
});
