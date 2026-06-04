import { hasPermission, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import { type ProductDocument, ProductDocumentType, type UUID } from '@pkg/schema';
import { IconLoader2, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type RefObject, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import {
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

export function ProductDocumentsSection({ productId }: ProductDocumentsSectionProps) {
  const trpc = useTRPC();
  const { invalidateDocuments } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const accessQuery = useAccess();
  const canDeleteDocuments = hasPermission(accessQuery.data, 'product:update');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<ProductDocumentType | null>(null);

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
  const deleteMutation = useMutation(
    trpc.documents.deleteByProduct.mutationOptions({
      onSuccess: async () => {
        await invalidateDocuments();
        toast.success('Document deleted');
      },
      onError: (error) => {
        showMutationError(error, 'Unable to delete document.');
      },
    }),
  );
  const productDocumentMetadata = useMemo(
    () => ({
      getSearchText: (document: ProductDocument) => PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type],
      render: (document: ProductDocument) => PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type],
    }),
    [],
  );

  return (
    <DocumentCardList
      canDelete={canDeleteDocuments}
      documents={documentsQuery.data ?? []}
      emptyMessage="No documents found."
      errorMessage={getApiQueryErrorMessage(documentsQuery.error, 'Unable to load documents.') ?? null}
      isLoading={documentsQuery.isLoading}
      metadata={productDocumentMetadata}
      owner={{ id: productId, type: 'product' }}
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
      onDelete={(document) => deleteMutation.mutateAsync({ documentId: document.id, productId })}
    />
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
          <IconLoader2 data-icon="inline-start" className="animate-spin" />
        ) : (
          <IconUpload data-icon="inline-start" />
        )}
        Upload
      </Button>
    </form>
  );
}
