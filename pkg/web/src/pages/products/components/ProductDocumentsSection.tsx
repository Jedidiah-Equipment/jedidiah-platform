import { formatBytes, formatDate, hasPermission, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import { type ProductDocument, ProductDocumentType, type UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
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
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  downloadProductDocument,
  getReadyProductDocumentUpload,
  PRODUCT_DOCUMENT_ACCEPT,
  type ReadyProductDocumentUpload,
  uploadProductDocument,
  validateSelectedFile,
} from '@/utils/document.js';

const PRODUCT_DOCUMENT_TYPE_OPTIONS = ProductDocumentType.options.map((type) => ({
  label: PRODUCT_DOCUMENT_TYPE_LABELS[type],
  value: type,
}));

type ProductDocumentsSectionProps = {
  productId: UUID;
};

type DocumentTableSortInput = {
  sortBy: 'byteSize' | 'createdAt' | 'filename' | 'type' | 'uploaderName';
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
  allowedSortIds: ['byteSize', 'createdAt', 'filename', 'type', 'uploaderName'],
  defaultSort: {
    id: 'filename',
  },
};

export function ProductDocumentsSection({ productId }: ProductDocumentsSectionProps) {
  const trpc = useTRPC();
  const { invalidateDocuments } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const accessQuery = useAccess();
  const canDeleteDocuments = hasPermission(accessQuery.data, 'product:update');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<ProductDocumentType | null>(null);
  const [previewDocument, setPreviewDocument] = useState<ProductDocument | null>(null);

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
    mutationFn: (upload: ReadyProductDocumentUpload) => uploadProductDocument(productId, upload),
    onSuccess: async () => {
      setSelectedFile(null);
      setSelectedType(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      await invalidateDocuments();
      toast.success('Document uploaded');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to upload document.');
    },
  });

  const documents = documentsQuery.data ?? [];
  const columns = useMemo<ColumnDef<ProductDocument>[]>(
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
        accessorFn: (document) => document.metadata.type,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{PRODUCT_DOCUMENT_TYPE_LABELS[row.original.metadata.type]}</span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: 'equals',
        header: 'Type',
        id: 'type',
        meta: {
          filterOptions: PRODUCT_DOCUMENT_TYPE_OPTIONS,
          filterVariant: 'select',
          headerClassName: 'w-40',
        },
        sortingFn: documentTypeSorting,
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
              const upload = getReadyProductDocumentUpload({ file: selectedFile, type: selectedType });
              if (!upload) return;
              void uploadMutation.mutateAsync(upload);
            }}
            onTypeChange={setSelectedType}
            selectedFile={selectedFile}
            selectedType={selectedType}
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
  selectedType: ProductDocumentType | null;
  onFileChange: (file: File | null) => void;
  onTypeChange: (type: ProductDocumentType | null) => void;
  onSubmit: () => void;
};

function DocumentUploadForm({
  fileInputRef,
  isPending,
  onFileChange,
  onSubmit,
  onTypeChange,
  selectedFile,
  selectedType,
}: DocumentUploadFormProps) {
  const canUpload = getReadyProductDocumentUpload({ file: selectedFile, type: selectedType }) !== null;
  const selectedTypeOption = PRODUCT_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === selectedType);

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
      <Select
        disabled={isPending}
        onValueChange={(value) => onTypeChange(value ? ProductDocumentType.parse(value) : null)}
        value={selectedType ?? ''}
      >
        <SelectTrigger aria-label="Document type" className="sm:w-40">
          <SelectValue placeholder="Select type">{selectedTypeOption?.label ?? null}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {PRODUCT_DOCUMENT_TYPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <Button disabled={!canUpload || isPending} type="submit">
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

function DeleteDocumentButton({ document, productId }: { document: ProductDocument; productId: UUID }) {
  const trpc = useTRPC();
  const { invalidateDocuments } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);
  const deleteMutation = useMutation(
    trpc.documents.deleteByProduct.mutationOptions({
      onSuccess: async () => {
        await invalidateDocuments();
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
  document: ProductDocument;
  onPreviewDocument: (document: ProductDocument) => void;
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

function DownloadButton({ document, productId }: { document: ProductDocument; productId: UUID }) {
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

function documentGlobalFilter(row: { original: ProductDocument }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return [
    row.original.filename,
    PRODUCT_DOCUMENT_TYPE_LABELS[row.original.metadata.type],
    row.original.contentType,
    row.original.uploaderName ?? '',
    row.original.uploaderEmail ?? '',
    formatBytes(row.original.byteSize),
    formatDate(row.original.createdAt, 'medium'),
  ].some((value) => value.toLowerCase().includes(search));
}

function documentTypeSorting(left: { original: ProductDocument }, right: { original: ProductDocument }): number {
  return PRODUCT_DOCUMENT_TYPE_LABELS[left.original.metadata.type].localeCompare(
    PRODUCT_DOCUMENT_TYPE_LABELS[right.original.metadata.type],
  );
}

function documentUploaderSorting(left: { original: ProductDocument }, right: { original: ProductDocument }): number {
  return getDocumentUploader(left.original).localeCompare(getDocumentUploader(right.original));
}

function getDocumentUploader(document: ProductDocument): string {
  return document.uploaderName ?? document.uploaderEmail ?? '';
}

function normalizeFilterValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}
