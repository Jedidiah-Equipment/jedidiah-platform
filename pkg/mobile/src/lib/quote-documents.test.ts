import { QuoteDocument } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { presentQuoteDocuments, quoteDocumentCountLabel, quoteDocumentMetaLine } from './quote-documents';

describe('Quote Document presentation', () => {
  it('filters by filename and sorts by upload date', () => {
    const documents = [
      buildDocument({ createdAt: '2026-07-18T08:00:00.000Z', filename: 'QUO-00001-rev-1.pdf', revision: 1 }),
      buildDocument({ createdAt: '2026-07-20T08:00:00.000Z', filename: 'QUO-00001-rev-3.pdf', revision: 3 }),
      buildDocument({ createdAt: '2026-07-19T08:00:00.000Z', filename: 'QUO-00001-rev-2.pdf', revision: 2 }),
    ];

    expect(presentQuoteDocuments(documents, '').map((document) => document.metadata.revision)).toEqual([3, 2, 1]);
    expect(
      presentQuoteDocuments(documents, '', 'uploaded-oldest').map((document) => document.metadata.revision),
    ).toEqual([1, 2, 3]);
    expect(presentQuoteDocuments(documents, ' REV-2 ').map((document) => document.metadata.revision)).toEqual([2]);
  });

  it('formats the revision, file facts, and count for the list', () => {
    const document = buildDocument({
      byteSize: 2048,
      createdAt: '2026-07-20T08:00:00.000Z',
      uploaderName: 'Dean van Niekerk',
      revision: 4,
    });

    expect(`Rev ${document.metadata.revision}`).toBe('Rev 4');
    expect(quoteDocumentMetaLine(document)).toBe('2 KB · Dean van Niekerk · 20 Jul 2026');
    expect(quoteDocumentCountLabel(0)).toBe('0 documents');
    expect(quoteDocumentCountLabel(1)).toBe('1 document');
    expect(quoteDocumentCountLabel(2)).toBe('2 documents');
  });
});

function buildDocument({
  byteSize = 1024,
  createdAt,
  filename,
  revision,
  uploaderName = 'Uploader',
}: {
  byteSize?: number;
  createdAt: string;
  filename?: string;
  revision: number;
  uploaderName?: string | null;
}) {
  return QuoteDocument.parse({
    byteSize,
    contentType: 'application/pdf',
    createdAt,
    filename: filename ?? `QUO-00001-rev-${revision}.pdf`,
    id: crypto.randomUUID(),
    jobId: null,
    metadata: { revision },
    ownerType: 'quote',
    productId: null,
    quoteId: crypto.randomUUID(),
    sourceProductId: null,
    uploaderEmail: 'uploader@example.com',
    uploaderName,
    uploaderUserId: 'auth-user-id',
  });
}
