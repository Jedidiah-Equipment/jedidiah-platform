import type { DocumentSummary as DocumentSummaryModel } from '@pkg/schema';
import { DocumentSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { filterDocumentCards, getVisibleDocumentCards, sortDocumentCards } from './document-card-list-state.js';

const metadata = {
  getSearchText: (document: DocumentSummaryModel) =>
    'type' in document.metadata ? document.metadata.type : `Rev ${document.metadata.revision}`,
};

describe('DocumentCardList helpers', () => {
  it('searches common document fields and metadata text', () => {
    const documents = [
      buildDocument({
        byteSize: 2 * 1024 * 1024,
        filename: 'installation-guide.pdf',
        metadata: { type: 'sop' },
        uploaderName: 'Casey Smith',
      }),
      buildDocument({
        contentType: 'image/png',
        createdAt: '2025-06-03T10:20:30.000Z',
        filename: 'warranty-photo.png',
        metadata: { type: 'brochure' },
        uploaderName: 'Morgan Reed',
      }),
    ];

    expect(filterDocumentCards({ documents, metadata, search: 'installation' })).toHaveLength(1);
    expect(filterDocumentCards({ documents, metadata, search: 'brochure' })).toHaveLength(1);
    expect(filterDocumentCards({ documents, metadata, search: 'Morgan' })).toHaveLength(1);
    expect(filterDocumentCards({ documents, metadata, search: '2 MB' })).toHaveLength(1);
    expect(filterDocumentCards({ documents, metadata, search: '2025' })).toHaveLength(1);
  });

  it('sorts by common document fields', () => {
    const documents = [
      buildDocument({
        byteSize: 100,
        createdAt: '2025-01-01T00:00:00.000Z',
        filename: 'beta.pdf',
        uploaderName: 'Zara',
      }),
      buildDocument({
        byteSize: 300,
        createdAt: '2025-03-01T00:00:00.000Z',
        filename: 'alpha.pdf',
        uploaderName: 'Anna',
      }),
    ];

    expect(sortDocumentCards(documents, 'filenameAsc').map((document) => document.filename)).toEqual([
      'alpha.pdf',
      'beta.pdf',
    ]);
    expect(sortDocumentCards(documents, 'createdAtDesc').map((document) => document.filename)).toEqual([
      'alpha.pdf',
      'beta.pdf',
    ]);
    expect(sortDocumentCards(documents, 'byteSizeDesc').map((document) => document.filename)).toEqual([
      'alpha.pdf',
      'beta.pdf',
    ]);
    expect(sortDocumentCards(documents, 'uploaderAsc').map((document) => document.filename)).toEqual([
      'alpha.pdf',
      'beta.pdf',
    ]);
  });

  it('returns all filtered and sorted documents', () => {
    const documents = Array.from({ length: 11 }).map((_, index) =>
      buildDocument({
        filename: `document-${String(index).padStart(2, '0')}.pdf`,
      }),
    );

    const visible = getVisibleDocumentCards({
      documents,
      metadata,
      search: '',
      sort: 'filenameAsc',
    });

    expect(visible.total).toBe(11);
    expect(visible.documents).toHaveLength(11);
  });
});

function buildDocument(overrides: Partial<Record<keyof DocumentSummaryModel, unknown>> = {}): DocumentSummaryModel {
  return DocumentSummary.parse({
    byteSize: 1024,
    contentType: 'application/pdf',
    createdAt: '2024-01-01T00:00:00.000Z',
    filename: 'document.pdf',
    id: crypto.randomUUID(),
    jobId: null,
    metadata: { type: 'part_book' },
    ownerType: 'product',
    productId: crypto.randomUUID(),
    quoteId: null,
    sourceProductId: null,
    uploaderEmail: 'uploader@example.com',
    uploaderName: 'Uploader',
    uploaderUserId: 'auth-user-id',
    ...overrides,
  });
}
