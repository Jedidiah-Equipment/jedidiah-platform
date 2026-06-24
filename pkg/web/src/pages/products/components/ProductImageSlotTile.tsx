import { PRODUCT_IMAGE_SLOT_SPECS, type ProductImage, type ProductImageSlot, type UUID } from '@pkg/schema';
import { IconLoader2, IconPhoto, IconUpload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { type FieldUsage, FieldUsageLabel } from '@/components/catalog/index.js';
import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useCredentialedImagePreview } from '@/hooks/use-credentialed-image-preview.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { cn } from '@/lib/utils.js';
import {
  fetchProductImageBlob,
  IMAGE_ACCEPT,
  uploadProductImage,
  validateSelectedProductImage,
} from '@/utils/product-image.js';

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
  const spec = PRODUCT_IMAGE_SLOT_SPECS[slot];
  const { invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useProductImagePreview({ image, productId, slot });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductImage(productId, slot, file),
    onSuccess: async () => {
      await invalidateProducts();
      toast.success(`${label} updated`);
    },
    onError: (error) => {
      showMutationError(error, 'Unable to upload image.');
    },
    onSettled: () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  return (
    <Field className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel>
          <FieldUsageLabel usage={usage}>{label}</FieldUsageLabel>
        </FieldLabel>
        <span className="text-muted-foreground text-xs">
          {spec.recommendedWidth}×{spec.recommendedHeight}px
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{description}</p>
      <div
        className={cn(
          'flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40',
        )}
      >
        {previewUrl ? (
          <img
            alt={`${label} preview`}
            className={cn('h-full w-full', spec.fit === 'cover' ? 'object-cover' : 'object-contain')}
            src={previewUrl}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <IconPhoto />
            <span className="text-xs">No image</span>
          </div>
        )}
      </div>
      <input
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={!canEdit || uploadMutation.isPending}
        onChange={(event) => {
          const file = validateSelectedProductImage(event.currentTarget.files?.[0] ?? null);
          if (file) {
            void uploadMutation.mutateAsync(file);
          } else if (event.currentTarget.files?.[0]) {
            event.currentTarget.value = '';
          }
        }}
        ref={fileInputRef}
        type="file"
      />
      <Button
        className="w-full"
        disabled={!canEdit || uploadMutation.isPending}
        onClick={() => fileInputRef.current?.click()}
        type="button"
        variant="outline"
      >
        {uploadMutation.isPending ? (
          <IconLoader2 className="animate-spin" data-icon="inline-start" />
        ) : (
          <IconUpload data-icon="inline-start" />
        )}
        {image ? 'Replace image' : 'Upload image'}
      </Button>
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
}): string | null {
  return useCredentialedImagePreview({
    enabled: image !== null,
    fetchBlob: ({ signal }) => fetchProductImageBlob({ productId, signal, slot }),
    queryKey: ['product-image-preview', productId, slot, image?.updatedAt ?? null],
  });
}
