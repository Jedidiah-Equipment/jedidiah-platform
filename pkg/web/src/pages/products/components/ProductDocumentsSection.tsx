import { formatBytes, hasPermission, PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain';
import type { DocumentMetadata, UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { DownloadIcon, EyeIcon, FileTextIcon, Loader2Icon, Trash2Icon, UploadIcon } from 'lucide-react';
import { type RefObject, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/data-table/DataTable.js';
import {
  useConstrainedPageIndex,
  useConstrainedTableState,
} from '@/components/data-table/hooks/use-constrained-table-state.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { getPageCount, type SortOptions } from '@/components/data-table/table-state.js';
import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { Button } from '@/components/ui/button.js';
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
import { Input } from '@/components/ui/input.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatDate } from '@/utils/date.js';
import {
  downloadProductDocument,
  PRODUCT_DOCUMENT_ACCEPT,
  uploadProductDocument,
  validateSelectedFile,
} from '@/utils/document.js';

type ProductDocumentsSectionProps = {
  productId: UUID;
};

type DocumentTableSortInput = {
  sortBy: 'byteSize' | 'createdAt' | 'filename' | 'uploaderName';
};

export const useProductDocumentsTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'filename',
        desc: false,
      },
    ],
  },
  persistName: 'product-documents-table',
});

const documentSortOptions: SortOptions<DocumentTableSortInput> = {
  allowedSortIds: ['byteSize', 'createdAt', 'filename', 'uploaderName'],
  defaultSort: {
    id: 'filename',
  },
};

export function ProductDocumentsSection({ productId }: ProductDocumentsSectionProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const accessQuery = useAccess();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentMetadata | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const canDeleteDocuments = hasPermission(accessQuery.data, 'product:update');
  const {
    columnFilters,
    globalFilter,
    pagination,
    setColumnFilters,
    setGlobalFilter,
    setPageIndex,
    setPagination,
    setSorting,
    sorting,
  } = useProductDocumentsTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      setPageIndex: state.setPageIndex,
      setPagination: state.setPagination,
      setSorting: state.setSorting,
      sorting: state.sorting,
    })),
  );

  const documentsQuery = useQuery(trpc.documents.listByProduct.queryOptions({ productId }));
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductDocument(productId, file),
    onSuccess: async () => {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() });
      toast.success('Document uploaded');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to upload document.');
    },
  });

  const documents = documentsQuery.data ?? [];
  const columns = useMemo<ColumnDef<DocumentMetadata>[]>(
    () => [
      {
        accessorKey: 'filename',
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2 font-medium">
            <FileTextIcon className="size-4 text-muted-foreground" />
            {row.original.filename}
          </span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Filename',
      },
      {
        accessorKey: 'byteSize',
        cell: ({ row }) => <span className="text-muted-foreground">{formatBytes(row.original.byteSize)}</span>,
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Size',
        meta: {
          headerClassName: 'w-32',
        },
      },
      {
        accessorKey: 'uploaderName',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.uploaderName ?? row.original.uploaderEmail}</span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Uploader',
        sortingFn: documentUploaderSorting,
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => (
          <span className="text-muted-foreground">{formatDate(row.original.createdAt, 'medium')}</span>
        ),
        enableColumnFilter: false,
        enableSorting: true,
        header: 'Date',
        meta: {
          headerClassName: 'w-48',
        },
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <div className="flex justify-end gap-1">
            <PreviewButton document={row.original} onPreviewDocument={setPreviewDocument} />
            <DownloadButton document={row.original} productId={productId} />
            {canDeleteDocuments ? <DeleteDocumentButton document={row.original} productId={productId} /> : null}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: {
          cellClassName: 'text-right',
          headerClassName: 'w-28 text-right',
        },
      },
    ],
    [canDeleteDocuments, productId],
  );
  const tableState = useConstrainedTableState({
    pagination,
    sorting,
    sortOptions: documentSortOptions,
    total: documents.length,
  });
  const table = useReactTable({
    autoResetPageIndex: false,
    columns,
    data: documents,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: documentGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      globalFilter,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });
  const total = table.getFilteredRowModel().rows.length;
  const pageCount = getPageCount(total, pagination.pageSize);

  useConstrainedPageIndex({ pageCount, pagination, setPageIndex });

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-base font-semibold">Documents</h2>
        <p className="text-sm text-muted-foreground">PDFs up to {formatBytes(PRODUCT_DOCUMENT_MAX_BYTES)}</p>
      </div>
      <DataTable
        emptyMessage="No documents found."
        errorMessage={getApiQueryErrorMessage(documentsQuery.error, 'Unable to load documents.')}
        globalFilterPlaceholder="Search documents..."
        isLoading={documentsQuery.isLoading}
        rightSection={
          <DocumentUploadForm
            fileInputRef={fileInputRef}
            isPending={uploadMutation.isPending}
            onFileChange={setSelectedFile}
            onSubmit={() => {
              if (!selectedFile) return;
              void uploadMutation.mutateAsync(selectedFile);
            }}
            selectedFile={selectedFile}
          />
        }
        table={table}
        total={total}
        totalLabel={(value) => `${value} ${value === 1 ? 'document' : 'documents'}`}
      />
      <DocumentPreviewSheet
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocument(null);
          }
        }}
        open={Boolean(previewDocument)}
        owner={{ id: productId, type: 'product' }}
      />
    </section>
  );
}

type DocumentUploadFormProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  isPending: boolean;
  selectedFile: File | null;
  onFileChange: (file: File | null) => void;
  onSubmit: () => void;
};

function DocumentUploadForm({
  fileInputRef,
  isPending,
  onFileChange,
  onSubmit,
  selectedFile,
}: DocumentUploadFormProps) {
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <Input
        ref={fileInputRef}
        accept={PRODUCT_DOCUMENT_ACCEPT}
        className="max-w-72"
        disabled={isPending}
        type="file"
        onChange={(event) => {
          const file = validateSelectedFile(event.currentTarget.files?.[0] ?? null);
          onFileChange(file);
          if (event.currentTarget.files?.[0] && !file) {
            event.currentTarget.value = '';
          }
        }}
      />
      <Button disabled={!selectedFile || isPending} type="submit">
        {isPending ? (
          <Loader2Icon data-icon="inline-start" className="animate-spin" />
        ) : (
          <UploadIcon data-icon="inline-start" />
        )}
        Upload
      </Button>
    </form>
  );
}

function DeleteDocumentButton({ document, productId }: { document: DocumentMetadata; productId: UUID }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const deleteMutation = useMutation(
    trpc.documents.deleteByProduct.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() });
        toast.success('Document deleted');
        setIsOpen(false);
      },
      onError: (error) => {
        showMutationError(error, 'Unable to delete document.');
      },
    }),
  );

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
          <DialogDescription>Delete {document.filename} from this Product's Documents list.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={deleteMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={deleteMutation.isPending}
            onClick={() => void deleteMutation.mutateAsync({ documentId: document.id, productId })}
            type="button"
            variant="destructive"
          >
            {deleteMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewButton({
  document,
  onPreviewDocument,
}: {
  document: DocumentMetadata;
  onPreviewDocument: (document: DocumentMetadata) => void;
}) {
  return (
    <Button
      aria-label={`Preview ${document.filename}`}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={() => onPreviewDocument(document)}
    >
      <EyeIcon />
    </Button>
  );
}

function DownloadButton({ document, productId }: { document: DocumentMetadata; productId: UUID }) {
  const showMutationError = useApiMutationErrorToast();
  const downloadMutation = useMutation({
    mutationFn: () => downloadProductDocument(productId, document),
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

function documentGlobalFilter(row: { original: DocumentMetadata }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return [
    row.original.filename,
    row.original.contentType,
    row.original.uploaderName ?? '',
    row.original.uploaderEmail ?? '',
    formatBytes(row.original.byteSize),
    formatDate(row.original.createdAt, 'medium'),
  ].some((value) => value.toLowerCase().includes(search));
}

function documentUploaderSorting(left: { original: DocumentMetadata }, right: { original: DocumentMetadata }): number {
  return getDocumentUploader(left.original).localeCompare(getDocumentUploader(right.original));
}

function getDocumentUploader(document: DocumentMetadata): string {
  return document.uploaderName ?? document.uploaderEmail ?? '';
}

function normalizeFilterValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
