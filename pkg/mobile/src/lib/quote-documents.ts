import { formatBytes, formatDate } from '@pkg/domain';
import type { QuoteDocument, QuoteKind, QuoteStatus } from '@pkg/schema';

export function presentQuoteDocuments(documents: readonly QuoteDocument[], search: string): QuoteDocument[] {
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filtered = normalizedSearch
    ? documents.filter((document) => document.filename.toLocaleLowerCase().includes(normalizedSearch))
    : documents;

  return [...filtered].sort(
    (left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime() ||
      right.metadata.revision - left.metadata.revision,
  );
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

export function getDefaultQuoteDocumentLeadTime(quote: { product: { buildTimeDays: number } | null }): string {
  return quote.product === null ? '' : formatQuoteDocumentLeadTime(quote.product.buildTimeDays);
}

export function resolveQuoteDocumentLeadTime({
  availability,
  fallbackLeadTime,
  hasUserEditedLeadTime,
  leadTime,
}: {
  availability: { defaultLeadTimeWorkingDays: number } | null | undefined;
  fallbackLeadTime: string;
  hasUserEditedLeadTime: boolean;
  leadTime: string;
}): string {
  if (hasUserEditedLeadTime) return leadTime;
  return availability ? formatQuoteDocumentLeadTime(availability.defaultLeadTimeWorkingDays) : fallbackLeadTime;
}

export function canGenerateQuoteDocument({
  canUpdate,
  kind,
  product,
  status,
}: {
  canUpdate: boolean;
  kind: QuoteKind;
  product: { buildTimeDays: number } | null;
  status: QuoteStatus;
}): boolean {
  const canRunStatus = status === 'draft' || status === 'sent' || status === 'accepted';
  return canUpdate && canRunStatus && (kind === 'custom' || product !== null);
}

function formatQuoteDocumentLeadTime(days: number): string {
  return `${days} working days`;
}
