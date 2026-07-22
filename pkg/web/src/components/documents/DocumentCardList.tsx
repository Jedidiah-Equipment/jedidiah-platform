import { useElementSize } from '@mantine/hooks';
import { DOCUMENT_ZIP_CONTENT_TYPE, documentContentTypeLabel, formatBytes, formatDate } from '@pkg/domain';
import type { DocumentSummary } from '@pkg/schema';
import {
  IconDownload,
  IconEye,
  IconFileTypeJpg,
  IconFileTypePdf,
  IconFileTypePng,
  IconFileTypeZip,
  IconFileUnknown,
  IconLoader2,
  IconPhoto,
  IconSearch,
  IconTrash,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Input } from '@/components/ui/input.js';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { cn } from '@/lib/utils.js';
import { type DocumentPreviewOwner, downloadDocument, getDocumentPreviewKind } from '@/utils/document.js';
import {
  DEFAULT_DOCUMENT_CARD_PAGE_SIZE,
  DEFAULT_DOCUMENT_CARD_SORT,
  DOCUMENT_CARD_SORT_OPTIONS,
  type DocumentCardSortValue,
  getDocumentUploader,
  getVisibleDocumentCards,
  parseDocumentCardSortValue,
} from './document-card-list-state.js';

const DOCUMENT_CARD_SKELETON_KEYS = [
  'document-card-skeleton-1',
  'document-card-skeleton-2',
  'document-card-skeleton-3',
];
const DOCUMENT_CARD_COMPACT_WIDTH = 720;

type DocumentCardListMetadata<TDocument extends DocumentSummary> = {
  getSearchText: (document: TDocument) => string;
  render: (document: TDocument) => React.ReactNode;
};

type DocumentCardListProps<TDocument extends DocumentSummary> = {
  documents: TDocument[];
  emptyMessage: string;
  emptyActionMessage?: string;
  emptySearchMessage?: string;
  errorMessage?: string | null;
  isLoading: boolean;
  metadata: DocumentCardListMetadata<TDocument>;
  owner: DocumentPreviewOwner;
  canDelete?: (document: TDocument) => boolean;
  defaultSort?: DocumentCardSortValue;
  onDelete?: (document: TDocument) => Promise<void> | void;
  pageSize?: number;
  rightSection?: React.ReactNode;
};

export function DocumentCardList<TDocument extends DocumentSummary>({
  canDelete = () => false,
  defaultSort = DEFAULT_DOCUMENT_CARD_SORT,
  documents,
  emptyActionMessage,
  emptyMessage,
  emptySearchMessage = 'No documents match this search.',
  errorMessage,
  isLoading,
  metadata,
  onDelete,
  owner,
  pageSize = DEFAULT_DOCUMENT_CARD_PAGE_SIZE,
  rightSection,
}: DocumentCardListProps<TDocument>) {
  const [previewDocument, setPreviewDocument] = useState<TDocument | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<DocumentCardSortValue>(defaultSort);
  const { ref: listRef, width } = useElementSize();
  const isCompact = width > 0 && width < DOCUMENT_CARD_COMPACT_WIDTH;

  const visible = useMemo(
    () => getVisibleDocumentCards({ documents, metadata, pageIndex, pageSize, search, sort }),
    [documents, metadata, pageIndex, pageSize, search, sort],
  );
  const selectedSortOption =
    DOCUMENT_CARD_SORT_OPTIONS.find((option) => option.value === sort) ?? DOCUMENT_CARD_SORT_OPTIONS[0];
  const shouldShowPager = visible.pageCount > 1;
  const hasSearch = search.trim().length > 0;
  const emptyTitle = hasSearch ? emptySearchMessage : emptyMessage;
  const emptyDescription = hasSearch ? 'Try a different search term.' : rightSection ? emptyActionMessage : undefined;

  useEffect(() => {
    if (visible.pageIndex !== pageIndex) {
      setPageIndex(visible.pageIndex);
    }
  }, [pageIndex, visible.pageIndex]);

  return (
    <section className="min-w-0" ref={listRef}>
      <Card className="min-w-0 gap-0 py-0">
        <CardContent className="flex min-h-10 flex-col gap-3 bg-muted/20 py-2 sm:flex-row sm:items-center sm:justify-between">
          <div className={cn('flex min-w-0 flex-1 items-center gap-3', !isCompact && 'sm:justify-between')}>
            <div className={cn('relative min-w-0 text-xs', isCompact ? 'w-full' : 'sm:w-80')}>
              <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-0 size-4 text-muted-foreground" />
              <Input
                aria-label="Search documents"
                className="h-6 translate-y-px border-0 bg-transparent! pr-0 pl-6 shadow-none focus-visible:border-0 focus-visible:ring-0"
                placeholder={isCompact ? 'Search...' : 'Search documents...'}
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  setPageIndex(0);
                }}
              />
            </div>
            <Select
              value={sort}
              onValueChange={(value) => {
                setSort(parseDocumentCardSortValue(value ?? ''));
                setPageIndex(0);
              }}
            >
              <SelectTrigger
                aria-label="Sort documents"
                className="h-6 w-fit border-0 bg-transparent! px-0 py-0 shadow-none focus-visible:border-0 focus-visible:ring-0 sm:justify-end"
              >
                <SelectValue>{selectedSortOption.label}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {DOCUMENT_CARD_SORT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {rightSection ? <div className="flex justify-start lg:justify-end">{rightSection}</div> : null}
        </CardContent>
        <CardSeparator />
        <CardContent className="grid min-w-0 gap-3 py-4">
          {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
          {isLoading ? <DocumentCardListSkeleton /> : null}
          {!isLoading && visible.documents.length > 0 ? (
            <div className="grid min-w-0 gap-3">
              {visible.documents.map((document) => (
                <DocumentCard
                  canDelete={canDelete(document) && Boolean(onDelete)}
                  document={document}
                  key={document.id}
                  metadata={metadata.render(document)}
                  compact={isCompact}
                  onPreviewDocument={setPreviewDocument}
                  owner={owner}
                  {...(onDelete ? { onDelete } : {})}
                />
              ))}
            </div>
          ) : null}
          {!isLoading && visible.documents.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyIcon />
                <EmptyTitle>{emptyTitle}</EmptyTitle>
                {emptyDescription ? <EmptyDescription>{emptyDescription}</EmptyDescription> : null}
              </EmptyHeader>
            </Empty>
          ) : null}
        </CardContent>
        {shouldShowPager || !isCompact ? (
          <CardContent className="flex flex-col gap-3 py-3 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
            {!isCompact ? (
              <span>
                {formatDocumentFooterCount({ documentCount: documents.length, search, visibleTotal: visible.total })}
              </span>
            ) : null}
            {shouldShowPager ? (
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      disabled={visible.pageIndex === 0}
                      onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-2 text-muted-foreground text-sm">
                      Page {visible.pageIndex + 1} of {visible.pageCount}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      disabled={visible.pageIndex >= visible.pageCount - 1}
                      onClick={() => setPageIndex((current) => Math.min(current + 1, visible.pageCount - 1))}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </CardContent>
        ) : null}
      </Card>
      <DocumentPreviewSheet
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocument(null);
          }
        }}
        open={Boolean(previewDocument)}
        owner={owner}
      />
    </section>
  );
}

function DocumentCard<TDocument extends DocumentSummary>({
  canDelete,
  compact,
  document,
  metadata,
  onDelete,
  onPreviewDocument,
  owner,
}: {
  canDelete: boolean;
  compact: boolean;
  document: TDocument;
  metadata: React.ReactNode;
  owner: DocumentPreviewOwner;
  onDelete?: (document: TDocument) => Promise<void> | void;
  onPreviewDocument: (document: TDocument) => void;
}) {
  const fileKind = getDocumentFileKind(document);
  const canPreview = getDocumentPreviewKind(document) !== null;

  return (
    <Card className="min-w-0" size="sm">
      <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${fileKind.iconChromeClassName}`}
            title={fileKind.label}
          >
            <fileKind.Icon aria-hidden className="size-6" />
            <span className="sr-only">{fileKind.label}</span>
          </div>
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="truncate">{document.filename}</CardTitle>
            <div className="truncate text-muted-foreground text-sm">{metadata}</div>
          </div>
        </div>
        <CardAction span="title">
          <div className="flex items-center gap-1">
            {canPreview ? (
              <Button
                aria-label={`Preview ${document.filename}`}
                size="icon-sm"
                type="button"
                variant="ghost"
                onClick={() => onPreviewDocument(document)}
              >
                <IconEye />
              </Button>
            ) : null}
            <DownloadDocumentButton document={document} owner={owner} />
            {canDelete && onDelete ? <DeleteDocumentButton document={document} onDelete={onDelete} /> : null}
          </div>
        </CardAction>
      </CardHeader>
      {!compact ? (
        <CardContent>
          <dl className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <DocumentFact label="Size" value={formatBytes(document.byteSize)} />
            <DocumentFact label="Uploader" value={getDocumentUploader(document)} />
            <DocumentFact label="Uploaded" value={formatDate(document.createdAt, 'medium')} />
          </dl>
        </CardContent>
      ) : null}
    </Card>
  );
}

function DownloadDocumentButton({ document, owner }: { document: DocumentSummary; owner: DocumentPreviewOwner }) {
  const showMutationError = useApiMutationErrorToast();
  const downloadMutation = useMutation({
    mutationFn: () => downloadDocument({ document, owner }),
    onError: (error) => {
      showMutationError(error, 'Unable to download document.');
    },
  });

  return (
    <Button
      aria-label={`Download ${document.filename}`}
      disabled={downloadMutation.isPending}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={() => void downloadMutation.mutateAsync()}
    >
      {downloadMutation.isPending ? <IconLoader2 className="animate-spin" /> : <IconDownload />}
    </Button>
  );
}

function DeleteDocumentButton<TDocument extends DocumentSummary>({
  document,
  onDelete,
}: {
  document: TDocument;
  onDelete: (document: TDocument) => Promise<void> | void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={<Button aria-label={`Delete ${document.filename}`} size="icon-sm" type="button" variant="ghost" />}
      >
        <IconTrash />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete document</DialogTitle>
          <DialogDescription>Delete {document.filename} from this Documents list.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={isDeleting} type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={isDeleting}
            onClick={async () => {
              setIsDeleting(true);
              try {
                await onDelete(document);
                setIsOpen(false);
              } finally {
                setIsDeleting(false);
              }
            }}
            type="button"
            variant="destructive"
          >
            {isDeleting ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <dt className="shrink-0 text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate text-xs">{value}</dd>
    </div>
  );
}

function DocumentCardListSkeleton() {
  return (
    <div className="grid gap-3">
      {DOCUMENT_CARD_SKELETON_KEYS.map((key) => (
        <Card key={key} size="sm">
          <CardHeader>
            <Skeleton className="h-10 w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-12 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getDocumentFileKind(document: Pick<DocumentSummary, 'contentType'>): {
  Icon: typeof IconFileUnknown;
  iconChromeClassName: string;
  label: string;
} {
  const contentType = document.contentType.toLowerCase();

  if (contentType === 'application/pdf') {
    return { Icon: IconFileTypePdf, iconChromeClassName: 'bg-red-500/10 text-red-400', label: 'PDF' };
  }

  if (contentType === 'image/png') {
    return { Icon: IconFileTypePng, iconChromeClassName: 'bg-blue-500/10 text-blue-400', label: 'PNG' };
  }

  if (contentType === 'image/jpeg') {
    return { Icon: IconFileTypeJpg, iconChromeClassName: 'bg-blue-500/10 text-blue-400', label: 'JPEG' };
  }

  if (contentType === DOCUMENT_ZIP_CONTENT_TYPE) {
    return {
      Icon: IconFileTypeZip,
      iconChromeClassName: 'bg-amber-500/10 text-amber-400',
      label: documentContentTypeLabel(contentType),
    };
  }

  if (contentType.startsWith('image/')) {
    return { Icon: IconPhoto, iconChromeClassName: 'bg-blue-500/10 text-blue-400', label: 'Image' };
  }

  return { Icon: IconFileUnknown, iconChromeClassName: 'bg-muted text-muted-foreground', label: 'File' };
}

function formatDocumentCount(total: number): string {
  return `${total} ${total === 1 ? 'document' : 'documents'}`;
}

function formatDocumentFooterCount({
  documentCount,
  search,
  visibleTotal,
}: {
  documentCount: number;
  search: string;
  visibleTotal: number;
}): string {
  if (search.trim()) {
    return `${visibleTotal} of ${formatDocumentCount(documentCount)}`;
  }

  return formatDocumentCount(visibleTotal);
}
