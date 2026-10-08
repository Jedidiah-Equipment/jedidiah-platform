import { formatNumber } from '@pkg/domain';
import { BREAKDOWN_PHOTO_POLICY } from '@pkg/domain/contracting';
import { BREAKDOWN_MAX_PHOTOS, type BreakdownDetail, type BreakdownPhoto } from '@pkg/schema/contracting';
import { IconX } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { PhotoPicker } from '@/contracting/components/PhotoPicker.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { breakdownPhotosUrl } from '@/contracting/lib/contracting-http-paths.js';
import { postMultipart } from '@/contracting/lib/post-multipart.js';
import { useTRPC } from '@/lib/trpc.js';
import { BreakdownPhotoPreview, BreakdownPhotoThumbnail } from './BreakdownPhotoPreview.js';
import type { BreakdownSheet } from './types.js';

export function BreakdownPhotosCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const canAdd = sheet.can('addPhotos');
  const [previewing, setPreviewing] = useState<BreakdownPhoto | null>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState('');
  const remove = useMutation(
    trpc.contractingBreakdowns.removePhoto.mutationOptions(write.card('Unable to remove the photo.')),
  );
  const upload = useMutation({
    mutationFn: async (photo: File) => {
      const body = new FormData();
      body.append('photo', photo, photo.name);
      await postMultipart(breakdownPhotosUrl(breakdown.id), body, 'Unable to add the photo.');
    },
    onSuccess: async () => {
      setSelected(null);
      await write.invalidate();
    },
    onError: (error) => setUploadError(error.message),
  });
  const full = breakdown.photos.length >= BREAKDOWN_MAX_PHOTOS;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Photos · {formatNumber(breakdown.photos.length)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {breakdown.photos.length ? (
          <ul className="flex flex-wrap gap-2">
            {breakdown.photos.map((photo, index) => (
              <li key={photo.id} className="relative size-28 overflow-hidden rounded-xl bg-muted">
                <button
                  aria-label={`Open photo ${formatNumber(index + 1)}`}
                  className="size-full cursor-zoom-in"
                  type="button"
                  onClick={() => setPreviewing(photo)}
                >
                  <BreakdownPhotoThumbnail breakdownId={breakdown.id} photoId={photo.id} />
                </button>
                {canAdd ? (
                  <RemoveEntityButton
                    title="Remove photo"
                    description="Remove this photo?"
                    triggerClassName="absolute right-1 top-1 rounded-full bg-black/60 text-white hover:bg-black/75 hover:text-white"
                    triggerIcon={IconX}
                    triggerIconOnly
                    triggerLabel={`Remove photo ${formatNumber(index + 1)}`}
                    triggerSize="icon-sm"
                    triggerVariant="ghost"
                    isPending={remove.isPending}
                    onConfirm={() => remove.mutate({ id: breakdown.id, photoId: photo.id })}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No photos.</p>
        )}
        {canAdd && !full ? (
          <PhotoPicker
            label="Add a photo"
            policy={BREAKDOWN_PHOTO_POLICY}
            photo={selected}
            pending={upload.isPending}
            error={uploadError}
            onError={setUploadError}
            onChange={(photo) => {
              setSelected(photo);
              if (photo) upload.mutate(photo);
            }}
          />
        ) : null}
      </CardContent>
      <BreakdownPhotoPreview
        breakdownId={breakdown.id}
        subjectCode={breakdown.subject.code}
        photo={previewing}
        onClose={() => setPreviewing(null)}
      />
    </Card>
  );
}
