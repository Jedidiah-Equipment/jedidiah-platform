import { formatNumber } from '@pkg/domain';
import { PRODUCT_IMAGE_POLICY } from '@pkg/domain/equipment';
import type { UUID } from '@pkg/schema';
import {
  PRODUCT_IMAGE_SLOT_SPECS,
  type ProductImage,
  type ProductImageSlot,
  type ProductImageSlotSpec,
} from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ImageSelectionControl } from '@/components/attachments/ImageSelectionControl.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { type FieldUsage, FieldUsageLabel } from '@/equipment/components/catalog/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import {
  fetchProductImageBlob,
  uploadProductImage,
  validateSelectedProductImage,
} from '@/equipment/utils/product-image.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useCredentialedImagePreviewState } from '@/hooks/use-credentialed-image-preview.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';

type ProductImageSlotTileProps = {
  canEdit: boolean;
  description: string;
  image: ProductImage | null;
  label: string;
  productId: UUID;
  slot: ProductImageSlot;
  usage: FieldUsage;
};

// One product image slot: a credentialed preview plus an upload-in-place button. The upload replaces the
// slot's current image immediately and invalidates the product query so the new image streams back.
export const ProductImageSlotTile: React.FC<ProductImageSlotTileProps> = ({
  canEdit,
  description,
  image,
  label,
  productId,
  slot,
  usage,
}) => {
  const spec: ProductImageSlotSpec = PRODUCT_IMAGE_SLOT_SPECS[slot];
  const { invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [error, setError] = useState('');

  const preview = useProductImagePreview({ image, productId, slot });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductImage(productId, slot, file),
    onSuccess: async () => {
      await invalidateProducts();
      toast.success(`${label} updated`);
    },
    onError: (error) => {
      showMutationError(error, 'Unable to upload image.');
    },
  });

  return (
    <Field className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel>
          <FieldUsageLabel usage={usage}>{label}</FieldUsageLabel>
        </FieldLabel>
        <span className="text-muted-foreground text-xs">
          {formatNumber(spec.recommendedWidth)}×{formatNumber(spec.recommendedHeight)}px
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      <ImageSelectionControl
        aspectRatio={spec.previewAspectRatio}
        fit={spec.fit}
        disabled={!canEdit}
        error={error || getApiQueryErrorMessage(preview.error, 'Unable to load image preview.') || ''}
        hasImage={image !== null}
        label={label}
        pending={uploadMutation.isPending}
        policy={PRODUCT_IMAGE_POLICY}
        previewUrl={preview.url}
        previewPending={preview.isLoading}
        onSelect={(selected) => {
          if (!canEdit || uploadMutation.isPending) return;
          setError('');
          const file = validateSelectedProductImage(selected, setError);
          if (file) uploadMutation.mutate(file);
        }}
      />
    </Field>
  );
};

// Fetches the slot's image as a credentialed blob and exposes a temporary object URL for preview.
// Keyed by `updatedAt` so a replace busts the cache and revokes the superseded object URL.
function useProductImagePreview({
  image,
  productId,
  slot,
}: {
  image: ProductImage | null;
  productId: UUID;
  slot: ProductImageSlot;
}) {
  return useCredentialedImagePreviewState({
    enabled: image !== null,
    fetchBlob: ({ signal }) => fetchProductImageBlob({ productId, signal, slot }),
    queryKey: ['product-image-preview', productId, slot, image?.updatedAt ?? null],
  });
}
