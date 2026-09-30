import { RANGE_LOGO_POLICY } from '@pkg/domain/equipment';
import type { EntityFile, UUID } from '@pkg/schema';
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
  fetchProductRangeLogoBlob,
  uploadProductRangeLogo,
  validateSelectedRangeLogo,
} from '@/equipment/utils/range-logo.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';

type RangeLogoUploadProps = {
  canEdit: boolean;
  logo: EntityFile | null;
  rangeId: UUID;
};

// The Product Range's brochure logo: a credentialed preview plus an upload-in-place button. Mirrors
// RangeImageUpload but targets the logo route; the logo appears in the top-right of every Product
// brochure for this Range.
export const RangeLogoUpload: React.FC<RangeLogoUploadProps> = ({ canEdit, logo, rangeId }) => {
  const { invalidateProductRanges } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [error, setError] = useState('');

  const preview = useCredentialedImagePreviewState({
    enabled: logo !== null,
    fetchBlob: ({ signal }) => fetchProductRangeLogoBlob({ rangeId, signal }),
    queryKey: ['range-logo-preview', rangeId, logo?.updatedAt ?? null],
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadProductRangeLogo(rangeId, file),
    onSuccess: async () => {
      await invalidateProductRanges();
      toast.success('Logo updated');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to upload logo.');
    },
  });

  return (
    <Field className="rounded-lg border p-3">
      <FieldLabel>
        <FieldUsageLabel usage={PRODUCT_RANGE_FIELD_USAGE.logo}>Logo</FieldUsageLabel>
      </FieldLabel>
      <FieldDescription>The logo shown in the top-right of this Range's Product brochures.</FieldDescription>
      <ImageSelectionControl
        disabled={!canEdit}
        error={error || getApiQueryErrorMessage(preview.error, 'Unable to load image preview.') || ''}
        hasImage={logo !== null}
        label="Range logo"
        pending={uploadMutation.isPending}
        policy={RANGE_LOGO_POLICY}
        previewUrl={preview.url}
        previewPending={preview.isLoading}
        onSelect={(selected) => {
          if (!canEdit || uploadMutation.isPending) return;
          setError('');
          const file = validateSelectedRangeLogo(selected, setError);
          if (file) uploadMutation.mutate(file);
        }}
      />
    </Field>
  );
};
