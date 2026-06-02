import { DocumentSummary, type ProductDocumentType } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { groupDocumentsByType } from './group-documents-by-type.js';

describe('groupDocumentsByType', () => {
  it('groups documents by their frozen type in enum order, omitting empty groups', () => {
    const partBook = jobDocument('Part Book.pdf', 'part_book');
    const sop = jobDocument('SOP.pdf', 'sop');
    const anotherSop = jobDocument('SOP 2.pdf', 'sop');

    const groups = groupDocumentsByType([partBook, sop, anotherSop]);

    expect(groups).toEqual([
      { type: 'sop', label: 'SOP', documents: [sop, anotherSop] },
      { type: 'part_book', label: 'Part Book', documents: [partBook] },
    ]);
  });

  it('groups a job snapshot by the frozen copied type, not the live product type', () => {
    // The job-owned snapshot froze 'part_book'; the source product was later re-classified to 'brochure'.
    const frozenSnapshot = jobDocument('Part Book.pdf', 'part_book');

    const groups = groupDocumentsByType([frozenSnapshot]);

    expect(groups).toEqual([{ type: 'part_book', label: 'Part Book', documents: [frozenSnapshot] }]);
  });

  it('omits documents without Product document type metadata', () => {
    const quoteDocument = DocumentSummary.parse({
      byteSize: 128,
      contentType: 'application/pdf',
      createdAt: '2026-06-02T10:00:00.000Z',
      filename: 'Quote.pdf',
      id: '11111111-1111-1111-8111-000000000099',
      jobId: null,
      metadata: { revision: 1 },
      ownerType: 'quote',
      productId: null,
      quoteId: '44444444-4444-4444-8444-444444444444',
      sourceProductId: null,
      uploaderEmail: 'test@example.com',
      uploaderName: 'Test User',
      uploaderUserId: 'test-user-id',
    });

    expect(groupDocumentsByType([quoteDocument])).toEqual([]);
  });
});

function jobDocument(filename: string, type: ProductDocumentType): DocumentSummary {
  return DocumentSummary.parse({
    byteSize: 128,
    contentType: 'application/pdf',
    createdAt: '2026-06-02T10:00:00.000Z',
    filename,
    id: `11111111-1111-1111-8111-${filename.length.toString().padStart(12, '0')}`,
    jobId: '33333333-3333-3333-8333-333333333333',
    metadata: { type },
    ownerType: 'job',
    productId: null,
    quoteId: null,
    sourceProductId: '22222222-2222-2222-8222-222222222222',
    uploaderEmail: 'test@example.com',
    uploaderName: 'Test User',
    uploaderUserId: 'test-user-id',
  });
}
