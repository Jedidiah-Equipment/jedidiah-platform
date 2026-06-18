import { BROCHURE_IMAGE_SLOT_SPECS, type BrochureImage, type BrochureImageSlot, type UUID } from '@pkg/schema';
import { IconLoader2, IconPhoto, IconUpload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useCredentialedImagePreview } from '@/hooks/use-credentialed-image-preview.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { cn } from '@/lib/utils.js';
import {
  fetchProductBrochureImageBlob,
  IMAGE_ACCEPT,
  uploadProductBrochureImage,
  validateSelectedBrochureImage,
} from '@/utils/brochure-image.js';

type BrochureImageSlotTileProps = {
  canEdit: boolean;
  description: string;
  image: BrochureImage | null;
  label: string;
  productId: UUID;
  slot: BrochureImageSlot;
};

// One brochure image slot: a credentialed preview plus an upload-in-place button. The upload replaces the
// slot's current image immediately and invalidates the product query so the new image streams back.
export const BrochureImageSlotTile: React.FC<BrochureImageSlotTileProps> = ({
  canEdit,
  description,
  image,
  label,
  productId,
  slot,
}) => {
  const spec = BROCHURE_IMAGE_SLOT_SPECS[slot];
  const { invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useBrochureImagePreview({ image, productId, slot });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductBrochureImage(productId, slot, file),
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
        <FieldLabel>{label}</FieldLabel>
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
          const file = validateSelectedBrochureImage(event.currentTarget.files?.[0] ?? null);
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
function useBrochureImagePreview({
  image,
  productId,
  slot,
}: {
  image: BrochureImage | null;
  productId: UUID;
  slot: BrochureImageSlot;
}): string | null {
  return useCredentialedImagePreview({
    enabled: image !== null,
    fetchBlob: ({ signal }) => fetchProductBrochureImageBlob({ productId, signal, slot }),
    queryKey: ['brochure-image-preview', productId, slot, image?.updatedAt ?? null],
  });
}
