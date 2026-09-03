import { evaluateProductBrochureCompleteness } from '@pkg/domain';
import type { Product } from '@pkg/schema';
import { IconEye } from '@tabler/icons-react';
import type React from 'react';
import { useCallback } from 'react';
import { FilePreviewSheet } from '@/components/documents/FilePreviewSheet.js';
import { useFilePreview } from '@/components/documents/use-file-preview.js';
import { Button } from '@/components/ui/button.js';
import { fetchProductBrochurePreviewBlob } from '@/utils/brochure.js';

type ProductBrochurePreviewProps = {
  product: Product;
};

// Brochure region for the Documents tab. The preview button is gated on the shared brochure-completeness
// predicate (computed from the persisted Product); the still-missing-field checklist itself now lives in the
// readiness aside, which is visible across every Product tab.
export const ProductBrochurePreview: React.FC<ProductBrochurePreviewProps> = ({ product }) => {
  const completeness = evaluateProductBrochureCompleteness(product);

  return (
    <div className="flex justify-end">
      <BrochurePreviewButton disabled={!completeness.complete} productId={product.id} />
    </div>
  );
};

type BrochurePreviewButtonProps = {
  disabled: boolean;
  productId: Product['id'];
};

// Opens a fresh generated preview each time; the PDF is never persisted as a Product Document.
const BrochurePreviewButton: React.FC<BrochurePreviewButtonProps> = ({ disabled, productId }) => {
  const preview = useFilePreview();
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => fetchProductBrochurePreviewBlob({ productId, signal }),
    [productId],
  );

  return (
    <>
      <Button disabled={disabled} onClick={() => preview.open()} type="button" variant="outline">
        <IconEye data-icon="inline-start" />
        Preview brochure
      </Button>
      <FilePreviewSheet
        description="Generated PDF"
        downloadFilename="brochure.pdf"
        fetchBlob={fetchBlob}
        kind="pdf"
        onOpenChange={preview.onOpenChange}
        open={preview.isOpen}
        queryKey={['product-brochure-preview', productId, preview.request]}
        subject="brochure"
        title="Brochure preview"
      />
    </>
  );
};
