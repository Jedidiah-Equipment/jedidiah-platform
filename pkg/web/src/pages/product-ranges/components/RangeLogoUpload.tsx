import type { EntityImage, UUID } from '@pkg/schema';
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
  fetchProductRangeLogoBlob,
  IMAGE_ACCEPT,
  uploadProductRangeLogo,
  validateSelectedRangeLogo,
} from '@/utils/range-logo.js';

type RangeLogoUploadProps = {
  canEdit: boolean;
  logo: EntityImage | null;
  rangeId: UUID;
};

// The Product Range's brochure logo: a credentialed preview plus an upload-in-place button. Mirrors
// RangeImageUpload but targets the logo route; the logo appears in the top-right of every Product
// brochure for this Range.
export const RangeLogoUpload: React.FC<RangeLogoUploadProps> = ({ canEdit, logo, rangeId }) => {
  const { invalidateProductRanges } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useCredentialedImagePreview({
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
    onSettled: () => {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
  });

  return (
    <Field className="rounded-lg border p-3">
      <FieldLabel>Logo</FieldLabel>
      <FieldDescription>The logo shown in the top-right of this Range's Product brochures.</FieldDescription>
      <div className="flex aspect-video w-full max-w-sm items-center justify-center overflow-hidden rounded-md border bg-muted/40">
        {previewUrl ? (
          <img alt="Range logo preview" className={cn('h-full w-full object-contain')} src={previewUrl} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <IconPhoto />
            <span className="text-xs">No logo</span>
          </div>
        )}
      </div>
      <input
        accept={IMAGE_ACCEPT}
        className="sr-only"
        disabled={!canEdit || uploadMutation.isPending}
        onChange={(event) => {
          const file = validateSelectedRangeLogo(event.currentTarget.files?.[0] ?? null);
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
        className="w-full max-w-sm"
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
        {logo ? 'Replace logo' : 'Upload logo'}
      </Button>
    </Field>
  );
};
