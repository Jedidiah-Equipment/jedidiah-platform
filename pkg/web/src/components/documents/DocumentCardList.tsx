import { formatBytes, formatDate } from '@pkg/domain';
import type { DocumentSummary } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import {
  DownloadIcon,
  EyeIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  Loader2Icon,
  SearchIcon,
  Trash2Icon,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
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
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group.js';
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
import { type DocumentPreviewOwner, downloadDocument } from '@/utils/document.js';
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

type DocumentCardListMetadata<TDocument extends DocumentSummary> = {
  getSearchText: (document: TDocument) => string;
  render: (document: TDocument) => React.ReactNode;
};

type DocumentCardListProps<TDocument extends DocumentSummary> = {
  documents: TDocument[];
  emptyMessage: string;
  errorMessage?: string | null;
  isLoading: boolean;
  metadata: DocumentCardListMetadata<TDocument>;
  owner: DocumentPreviewOwner;
  canDelete?: boolean;
  onDelete?: (document: TDocument) => Promise<void> | void;
  pageSize?: number;
  rightSection?: React.ReactNode;
};

export function DocumentCardList<TDocument extends DocumentSummary>({
  canDelete = false,
  documents,
  emptyMessage,
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
  const [sort, setSort] = useState<DocumentCardSortValue>(DEFAULT_DOCUMENT_CARD_SORT);

  const visible = useMemo(
    () => getVisibleDocumentCards({ documents, metadata, pageIndex, pageSize, search, sort }),
    [documents, metadata, pageIndex, pageSize, search, sort],
  );
  const selectedSortOption =
    DOCUMENT_CARD_SORT_OPTIONS.find((option) => option.value === sort) ?? DOCUMENT_CARD_SORT_OPTIONS[0];
  const shouldShowPager = visible.pageCount > 1;

  useEffect(() => {
    if (visible.pageIndex !== pageIndex) {
      setPageIndex(visible.pageIndex);
    }
  }, [pageIndex, visible.pageIndex]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="sm:max-w-80">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Search documents"
              placeholder="Search documents..."
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPageIndex(0);
              }}
            />
          </InputGroup>
          <Select
            value={sort}
            onValueChange={(value) => {
              setSort(parseDocumentCardSortValue(value ?? ''));
              setPageIndex(0);
            }}
          >
            <SelectTrigger aria-label="Sort documents" className="w-full sm:w-48">
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
      </div>
      {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}
      <div className="flex items-center justify-between gap-3 text-muted-foreground text-sm">
        <span>{formatDocumentCount(visible.total)}</span>
        {search.trim() ? <span>{formatSearchResultCount(visible.total, documents.length)}</span> : null}
      </div>
      {isLoading ? <DocumentCardListSkeleton /> : null}
      {!isLoading && visible.documents.length > 0 ? (
        <div className="grid gap-3">
          {visible.documents.map((document) => (
            <DocumentCard
              canDelete={canDelete && Boolean(onDelete)}
              document={document}
              key={document.id}
              metadata={metadata.render(document)}
              onPreviewDocument={setPreviewDocument}
              owner={owner}
              {...(onDelete ? { onDelete } : {})}
            />
          ))}
        </div>
      ) : null}
      {!isLoading && visible.documents.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-3 text-muted-foreground text-sm">{emptyMessage}</p>
      ) : null}
      {shouldShowPager ? (
        <Pagination className="justify-end">
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
  document,
  metadata,
  onDelete,
  onPreviewDocument,
  owner,
}: {
  canDelete: boolean;
  document: TDocument;
  metadata: React.ReactNode;
  owner: DocumentPreviewOwner;
  onDelete?: (document: TDocument) => Promise<void> | void;
  onPreviewDocument: (document: TDocument) => void;
}) {
  const fileKind = getDocumentFileKind(document);

  return (
    <Card size="sm">
      <CardHeader className="min-w-0">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <fileKind.Icon className="size-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="truncate">{document.filename}</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{fileKind.label}</Badge>
              <span>{document.contentType}</span>
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <div className="flex items-center gap-1">
            <Button
              aria-label={`Preview ${document.filename}`}
              size="icon-sm"
              type="button"
              variant="ghost"
              onClick={() => onPreviewDocument(document)}
            >
              <EyeIcon />
            </Button>
            <DownloadDocumentButton document={document} owner={owner} />
            {canDelete && onDelete ? <DeleteDocumentButton document={document} onDelete={onDelete} /> : null}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DocumentFact label="Metadata" value={metadata} />
          <DocumentFact label="Size" value={formatBytes(document.byteSize)} />
          <DocumentFact label="Uploader" value={getDocumentUploader(document)} />
          <DocumentFact label="Uploaded" value={formatDate(document.createdAt, 'medium')} />
        </dl>
      </CardContent>
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
      {downloadMutation.isPending ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
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
        <Trash2Icon />
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
            {isDeleting ? <Loader2Icon className="animate-spin" data-icon="inline-start" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentFact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
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
  Icon: typeof FileIcon;
  label: string;
} {
  const contentType = document.contentType.toLowerCase();

  if (contentType === 'application/pdf') {
    return { Icon: FileTextIcon, label: 'PDF' };
  }

  if (contentType.startsWith('image/')) {
    return { Icon: FileImageIcon, label: 'Image' };
  }

  return { Icon: FileIcon, label: 'File' };
}

function formatDocumentCount(total: number): string {
  return `${total} ${total === 1 ? 'document' : 'documents'}`;
}

function formatSearchResultCount(total: number, documentCount: number): string {
  return `${total} of ${documentCount}`;
}
