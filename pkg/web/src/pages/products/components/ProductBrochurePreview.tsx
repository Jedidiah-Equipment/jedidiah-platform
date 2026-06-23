import { evaluateProductBrochureCompleteness, formatBytes } from '@pkg/domain';
import type { BrochureRequiredField, Product } from '@pkg/schema';
import { IconAlertTriangle, IconDownload, IconEye } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { downloadProductBrochure, fetchProductBrochurePreviewBlob } from '@/utils/brochure.js';

// Human labels for the brochure-completeness alert, keyed by the schema's required-field vocabulary.
const BROCHURE_REQUIRED_FIELD_LABELS: Record<BrochureRequiredField, string> = {
  category: 'Category',
  keyFeatures: 'At least one key feature',
  primary: 'Primary image',
  technicalDrawing: 'Technical drawing image',
  banner: 'Banner image',
  description: 'Product description',
  assemblies: 'At least one assembly',
};

type ProductBrochurePreviewProps = {
  product: Product;
};

// Brochure region for the Documents tab. Completeness is computed from the persisted Product (this section
// lives outside the autosave form, so there is no live form subscription) via the shared predicate, so the
// missing-field list stays in lockstep with the server-side preview/generation gates.
export const ProductBrochurePreview: React.FC<ProductBrochurePreviewProps> = ({ product }) => {
  const completeness = evaluateProductBrochureCompleteness(product);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <BrochurePreviewButton disabled={!completeness.complete} productId={product.id} />
      </div>
      {completeness.complete ? null : <BrochureCompletenessAlert missingFields={completeness.missingFields} />}
    </div>
  );
};

type BrochurePreviewButtonProps = {
  disabled: boolean;
  productId: Product['id'];
};

// Opens a fresh generated preview each time; the PDF is never persisted as a Product Document.
const BrochurePreviewButton: React.FC<BrochurePreviewButtonProps> = ({ disabled, productId }) => {
  const [previewRequest, setPreviewRequest] = useState(0);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handlePreview = () => {
    setPreviewRequest((current) => current + 1);
    setIsPreviewOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsPreviewOpen(open);
  };

  return (
    <>
      <Button disabled={disabled} onClick={handlePreview} type="button" variant="outline">
        <IconEye data-icon="inline-start" />
        Preview brochure
      </Button>
      <BrochurePreviewSheet
        onOpenChange={handleOpenChange}
        open={isPreviewOpen}
        productId={productId}
        previewRequest={previewRequest}
      />
    </>
  );
};

type BrochurePreviewSheetProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  productId: Product['id'];
  previewRequest: number;
};

const BrochurePreviewSheet: React.FC<BrochurePreviewSheetProps> = ({
  onOpenChange,
  open,
  productId,
  previewRequest,
}) => {
  const showMutationError = useApiMutationErrorToast();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewQuery = useQuery({
    enabled: open && previewRequest > 0,
    queryFn: ({ signal }) => fetchProductBrochurePreviewBlob({ productId, signal }),
    queryKey: ['product-brochure-preview', productId, previewRequest],
    staleTime: 0,
  });
  const downloadMutation = useMutation({
    mutationFn: () => downloadProductBrochure(productId),
    onError: (error) => {
      showMutationError(error, 'Unable to download brochure.');
    },
  });

  useEffect(() => {
    if (!open || !previewQuery.data) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(previewQuery.data);
    setPreviewUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [open, previewQuery.data]);

  const isLoadingPreview = open && !previewUrl && previewQuery.isFetching;

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent
        className="gap-0 p-0 data-[side=right]:w-[min(100vw,56rem)] data-[side=right]:sm:max-w-none"
        side="right"
      >
        <SheetHeader>
          <SheetTitle className="truncate">Brochure preview</SheetTitle>
          <SheetDescription>
            {previewQuery.data
              ? `${previewQuery.data.type || 'application/pdf'} · ${formatBytes(previewQuery.data.size)}`
              : 'Generated PDF'}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex min-h-full flex-col gap-3 p-4">
            <BrochurePreviewContent
              isLoading={isLoadingPreview}
              previewUrl={previewUrl}
              queryError={previewQuery.error}
            />
            <Button
              className="self-start"
              disabled={downloadMutation.isPending}
              onClick={() => void downloadMutation.mutateAsync()}
              type="button"
              variant="outline"
            >
              <IconDownload data-icon="inline-start" />
              Download
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};

const BrochurePreviewContent: React.FC<{
  isLoading: boolean;
  previewUrl: string | null;
  queryError: unknown;
}> = ({ isLoading, previewUrl, queryError }) => {
  if (queryError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Unable to preview brochure</AlertTitle>
        <AlertDescription>Download the brochure or try previewing it again.</AlertDescription>
      </Alert>
    );
  }

  if (isLoading || !previewUrl) {
    return <Skeleton className="h-[calc(100vh-9rem)] w-full rounded-md" />;
  }

  return (
    <iframe
      className="h-[calc(100vh-9rem)] w-full rounded-md border bg-background"
      src={previewUrl}
      title="Brochure preview"
    />
  );
};

type BrochureCompletenessAlertProps = {
  missingFields: BrochureRequiredField[];
};

// Surfaces the still-missing required fields so the brochure can be completed before preview/generation.
// The verdict comes from the shared `evaluateBrochureCompleteness` predicate, so this list stays in lockstep
// with the server-side gates that consume the same predicate.
const BrochureCompletenessAlert: React.FC<BrochureCompletenessAlertProps> = ({ missingFields }) => (
  <Alert>
    <IconAlertTriangle />
    <AlertTitle>Brochure incomplete</AlertTitle>
    <AlertDescription>
      <p>Fill in the following before this brochure can be previewed or generated:</p>
      <ul className="list-disc pl-5">
        {missingFields.map((field) => (
          <li key={field}>{BROCHURE_REQUIRED_FIELD_LABELS[field]}</li>
        ))}
      </ul>
    </AlertDescription>
  </Alert>
);
