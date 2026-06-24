import { type EntityImage, PRODUCT_IMAGE_SLOT_SPECS, type UUID } from '@pkg/schema';
import { IconLoader2, IconPhoto, IconUpload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useRef } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useCredentialedImagePreview } from '@/hooks/use-credentialed-image-preview.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { cn } from '@/lib/utils.js';
import {
  fetchProductRangeImageBlob,
  IMAGE_ACCEPT,
  uploadProductRangeImage,
  validateSelectedRangeImage,
} from '@/utils/range-image.js';

type RangeImageUploadProps = {
  canEdit: boolean;
  image: EntityImage | null;
  rangeId: UUID;
};

// The Product Range's single presentation image: a credentialed preview plus an upload-in-place button.
// The upload replaces the current image immediately and invalidates the Range query so the new image
// streams back.
export const RangeImageUpload: React.FC<RangeImageUploadProps> = ({ canEdit, image, rangeId }) => {
  const secondaryImageSpec = PRODUCT_IMAGE_SLOT_SPECS.secondary1;
  const { invalidateProductRanges } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useCredentialedImagePreview({
    enabled: image !== null,
    fetchBlob: ({ signal }) => fetchProductRangeImageBlob({ rangeId, signal }),
    queryKey: ['range-image-preview', rangeId, image?.updatedAt ?? null],
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductRangeImage(rangeId, file),
    onSuccess: async () => {
      await invalidateProductRanges();
      toast.success('Image updated');
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
        <FieldLabel>Image</FieldLabel>
        <span className="text-muted-foreground text-xs">
          {secondaryImageSpec.recommendedWidth}×{secondaryImageSpec.recommendedHeight}px
        </span>
      </div>
      <FieldDescription>The presentation image shown for this Range.</FieldDescription>
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40">
        {previewUrl ? (
          <img alt="Range preview" className={cn('h-full w-full object-contain')} src={previewUrl} />
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
          const file = validateSelectedRangeImage(event.currentTarget.files?.[0] ?? null);
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
