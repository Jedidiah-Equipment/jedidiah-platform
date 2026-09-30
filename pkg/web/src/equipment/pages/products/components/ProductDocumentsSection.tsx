import { hasPermission } from '@pkg/domain';
import { JOB_DOCUMENT_TYPE_LABELS } from '@pkg/domain/equipment';
import { type Product, type ProductDocument, ProductDocumentType } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { DocumentCardList } from '@/equipment/components/documents/DocumentCardList.js';
import { DocumentUploadForm } from '@/equipment/components/documents/DocumentUploadForm.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import {
  getReadyProductDocumentUpload,
  type ReadyProductDocumentUpload,
  uploadProductDocument,
} from '@/equipment/utils/document.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

import { ProductBrochurePreview } from './ProductBrochurePreview.js';

const PRODUCT_DOCUMENT_TYPE_OPTIONS = ProductDocumentType.options.map((type) => ({
  label: JOB_DOCUMENT_TYPE_LABELS[type],
  value: type,
}));

type ProductDocumentsSectionProps = {
  product: Product;
};

export function ProductDocumentsSection({ product }: ProductDocumentsSectionProps) {
  const productId = product.id;
  const trpc = useTRPC();
  const { invalidateDocuments, invalidateQuotes } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const accessQuery = useAccess();
  const canDeleteDocuments = hasPermission(accessQuery.data, 'equipment_product:update');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedType, setSelectedType] = useState<ProductDocumentType | null>(null);

  const documentsQuery = useQuery(trpc.documents.listByProduct.queryOptions({ productId }));

  const uploadMutation = useMutation({
    mutationFn: (upload: ReadyProductDocumentUpload) => uploadProductDocument(productId, upload),
    onSuccess: async () => {
      setSelectedFile(null);
      setSelectedType(null);
      await Promise.all([invalidateDocuments(), invalidateQuotes()]);
      toast.success('Document uploaded');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to upload document.');
    },
  });
  const deleteMutation = useMutation(
    trpc.documents.deleteByProduct.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateDocuments(), invalidateQuotes()]);
        toast.success('Document deleted');
      },
      onError: (error) => {
        showMutationError(error, 'Unable to delete document.');
      },
    }),
  );
  const productDocumentMetadata = useMemo(
    () => ({
      getSearchText: (document: ProductDocument) => JOB_DOCUMENT_TYPE_LABELS[document.metadata.type],
      render: (document: ProductDocument) => JOB_DOCUMENT_TYPE_LABELS[document.metadata.type],
    }),
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <ProductBrochurePreview product={product} />
      <DocumentCardList
        canDelete={() => canDeleteDocuments}
        documents={documentsQuery.data ?? []}
        emptyActionMessage="Choose a file and type, then upload the first Product document."
        emptyMessage="No Product documents yet."
        errorMessage={getApiQueryErrorMessage(documentsQuery.error, 'Unable to load documents.') ?? null}
        isLoading={documentsQuery.isLoading}
        metadata={productDocumentMetadata}
        owner={{ id: productId, type: 'product' }}
        rightSection={
          canDeleteDocuments ? (
            <DocumentUploadForm
              ownerType="product"
              label="Product document"
              typeOptions={PRODUCT_DOCUMENT_TYPE_OPTIONS}
              isPending={uploadMutation.isPending}
              onFileChange={setSelectedFile}
              onSubmit={() => {
                const upload = getReadyProductDocumentUpload({ file: selectedFile, type: selectedType });
                if (!upload) return;
                uploadMutation.mutate(upload);
              }}
              onTypeChange={(value) => setSelectedType(value ? ProductDocumentType.parse(value) : null)}
              selectedFile={selectedFile}
              selectedType={selectedType}
            />
          ) : undefined
        }
        onDelete={(document) => deleteMutation.mutateAsync({ documentId: document.id, productId })}
      />
    </div>
  );
}
