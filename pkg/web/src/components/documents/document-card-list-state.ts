import { formatBytes, formatDate } from '@pkg/domain';
import type { DocumentSummary } from '@pkg/schema';

export type DocumentCardSortValue =
  | 'filenameAsc'
  | 'filenameDesc'
  | 'createdAtDesc'
  | 'createdAtAsc'
  | 'byteSizeDesc'
  | 'byteSizeAsc'
  | 'uploaderAsc'
  | 'uploaderDesc';

export const DOCUMENT_CARD_SORT_OPTIONS = [
  { label: 'Filename A-Z', value: 'filenameAsc' },
  { label: 'Filename Z-A', value: 'filenameDesc' },
  { label: 'Uploaded newest', value: 'createdAtDesc' },
  { label: 'Uploaded oldest', value: 'createdAtAsc' },
  { label: 'Size largest', value: 'byteSizeDesc' },
  { label: 'Size smallest', value: 'byteSizeAsc' },
  { label: 'Uploader A-Z', value: 'uploaderAsc' },
  { label: 'Uploader Z-A', value: 'uploaderDesc' },
] as const satisfies ReadonlyArray<{ label: string; value: DocumentCardSortValue }>;

export const DEFAULT_DOCUMENT_CARD_SORT: DocumentCardSortValue = 'filenameAsc';
export const DEFAULT_DOCUMENT_CARD_PAGE_SIZE = 10;

export type DocumentCardListMetadataState<TDocument extends DocumentSummary> = {
  getSearchText: (document: TDocument) => string;
};

type VisibleDocumentCardsInput<TDocument extends DocumentSummary> = {
  documents: TDocument[];
  metadata: DocumentCardListMetadataState<TDocument>;
  pageIndex: number;
  pageSize: number;
  search: string;
  sort: DocumentCardSortValue;
};

type VisibleDocumentCards<TDocument extends DocumentSummary> = {
  documents: TDocument[];
  pageCount: number;
  pageIndex: number;
  total: number;
};

export function getVisibleDocumentCards<TDocument extends DocumentSummary>({
  documents,
  metadata,
  pageIndex,
  pageSize,
  search,
  sort,
}: VisibleDocumentCardsInput<TDocument>): VisibleDocumentCards<TDocument> {
  const filteredDocuments = filterDocumentCards({ documents, metadata, search });
  const sortedDocuments = sortDocumentCards(filteredDocuments, sort);
  const pageCount = getDocumentCardPageCount(sortedDocuments.length, pageSize);
  const constrainedPageIndex = Math.min(pageIndex, Math.max(pageCount - 1, 0));
  const pageStart = constrainedPageIndex * pageSize;

  return {
    documents: sortedDocuments.slice(pageStart, pageStart + pageSize),
    pageCount,
    pageIndex: constrainedPageIndex,
    total: sortedDocuments.length,
  };
}

export function filterDocumentCards<TDocument extends DocumentSummary>({
  documents,
  metadata,
  search,
}: Pick<VisibleDocumentCardsInput<TDocument>, 'documents' | 'metadata' | 'search'>): TDocument[] {
  const normalizedSearch = normalizeSearchValue(search);

  if (!normalizedSearch) {
    return documents;
  }

  return documents.filter((document) =>
    getDocumentSearchText(document, metadata.getSearchText(document)).includes(normalizedSearch),
  );
}

export function sortDocumentCards<TDocument extends DocumentSummary>(
  documents: TDocument[],
  sort: DocumentCardSortValue,
): TDocument[] {
  return [...documents].sort((left, right) => compareDocumentCards(left, right, sort));
}

export function getDocumentCardPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function getDocumentUploader(document: Pick<DocumentSummary, 'uploaderEmail' | 'uploaderName'>): string {
  return document.uploaderName ?? document.uploaderEmail ?? 'Unknown uploader';
}

export function parseDocumentCardSortValue(value: string): DocumentCardSortValue {
  return DOCUMENT_CARD_SORT_OPTIONS.find((option) => option.value === value)?.value ?? DEFAULT_DOCUMENT_CARD_SORT;
}

function compareDocumentCards(left: DocumentSummary, right: DocumentSummary, sort: DocumentCardSortValue): number {
  switch (sort) {
    case 'filenameAsc':
      return compareStrings(left.filename, right.filename);
    case 'filenameDesc':
      return compareStrings(right.filename, left.filename);
    case 'createdAtDesc':
      return compareDates(right.createdAt, left.createdAt);
    case 'createdAtAsc':
      return compareDates(left.createdAt, right.createdAt);
    case 'byteSizeDesc':
      return right.byteSize - left.byteSize;
    case 'byteSizeAsc':
      return left.byteSize - right.byteSize;
    case 'uploaderAsc':
      return compareStrings(getDocumentUploader(left), getDocumentUploader(right));
    case 'uploaderDesc':
      return compareStrings(getDocumentUploader(right), getDocumentUploader(left));
    default:
      return assertNever(sort);
  }
}

function getDocumentSearchText(document: DocumentSummary, metadataText: string): string {
  return [
    document.filename,
    document.contentType,
    metadataText,
    getDocumentUploader(document),
    formatBytes(document.byteSize),
    formatDate(document.createdAt, 'medium'),
  ]
    .join(' ')
    .toLowerCase();
}

function compareDates(left: string, right: string): number {
  return new Date(left).getTime() - new Date(right).getTime();
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, undefined, { sensitivity: 'base' });
}

function normalizeSearchValue(value: string): string {
  return value.trim().toLowerCase();
}

function assertNever(value: never): never {
  throw new Error(`Unsupported document sort: ${value}`);
}
