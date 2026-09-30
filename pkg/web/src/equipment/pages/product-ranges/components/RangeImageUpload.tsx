import { formatNumber } from '@pkg/domain';
import { RANGE_IMAGE_POLICY } from '@pkg/domain/equipment';
import type { EntityFile, UUID } from '@pkg/schema';
import { PRODUCT_IMAGE_SLOT_SPECS } from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ImageSelectionControl } from '@/components/attachments/ImageSelectionControl.js';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { FieldUsageLabel, PRODUCT_RANGE_FIELD_USAGE } from '@/equipment/components/catalog/index.js';
import { useCredentialedImagePreviewState } from '@/equipment/hooks/use-credentialed-image-preview.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import {
  fetchProductRangeImageBlob,
  uploadProductRangeImage,
  validateSelectedRangeImage,
} from '@/equipment/utils/range-image.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiMutationErrorMessage, getApiQueryErrorMessage } from '@/lib/api-errors.js';

type RangeImageUploadProps = {
  canEdit: boolean;
  image: EntityFile | null;
  rangeId: UUID;
};

// The Product Range's single presentation image: a credentialed preview plus an upload-in-place button.
// The upload replaces the current image immediately and invalidates the Range query so the new image
// streams back.
export const RangeImageUpload: React.FC<RangeImageUploadProps> = ({ canEdit, image, rangeId }) => {
  const secondaryImageSpec = PRODUCT_IMAGE_SLOT_SPECS.secondary1;
  const { invalidateProductRanges } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [error, setError] = useState('');

  const preview = useCredentialedImagePreviewState({
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
      setError(getApiMutationErrorMessage(error, 'Unable to upload image.'));
      showMutationError(error, 'Unable to upload image.');
    },
  });

  return (
    <Field className="rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel>
          <FieldUsageLabel usage={PRODUCT_RANGE_FIELD_USAGE.image}>Image</FieldUsageLabel>
        </FieldLabel>
        <span className="text-muted-foreground text-xs">
          {formatNumber(secondaryImageSpec.recommendedWidth)}×{formatNumber(secondaryImageSpec.recommendedHeight)}px
        </span>
      </div>
      <FieldDescription>The presentation image shown for this Range.</FieldDescription>
      <ImageSelectionControl
        disabled={!canEdit}
        error={error || getApiQueryErrorMessage(preview.error, 'Unable to load image preview.') || ''}
        hasImage={image !== null}
        label="Range image"
        pending={uploadMutation.isPending}
        policy={RANGE_IMAGE_POLICY}
        previewUrl={preview.url}
        previewPending={preview.isLoading}
        onSelect={(selected) => {
          if (!canEdit || uploadMutation.isPending) return;
          setError('');
          const file = validateSelectedRangeImage(selected, setError);
          if (file) uploadMutation.mutate(file);
        }}
      />
    </Field>
  );
};
