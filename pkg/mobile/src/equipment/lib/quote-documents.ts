import { formatBytes, formatDate } from '@pkg/domain';
import type { QuoteDocument } from '@pkg/schema';

export type QuoteDocumentSort = 'uploaded-newest' | 'uploaded-oldest';

export function presentQuoteDocuments(
  documents: readonly QuoteDocument[],
  search: string,
  sort: QuoteDocumentSort,
): QuoteDocument[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = normalizedSearch
    ? documents.filter((document) => document.filename.toLocaleLowerCase().includes(normalizedSearch))
    : documents;

  return [...filtered].sort((left, right) => {
    const oldestFirst =
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() ||
      left.metadata.revision - right.metadata.revision;

    return sort === 'uploaded-oldest' ? oldestFirst : -oldestFirst;
  });
}

export function quoteDocumentMetaLine(
  document: Pick<QuoteDocument, 'byteSize' | 'createdAt' | 'uploaderEmail' | 'uploaderName'>,
): string {
  const uploader = document.uploaderName ?? document.uploaderEmail ?? 'Unknown uploader';
  return `${formatBytes(document.byteSize)} · ${uploader} · ${formatDate(document.createdAt, 'd MMM yyyy')}`;
}

export function quoteDocumentCountLabel(count: number): string {
  return `${count} document${count === 1 ? '' : 's'}`;
}
