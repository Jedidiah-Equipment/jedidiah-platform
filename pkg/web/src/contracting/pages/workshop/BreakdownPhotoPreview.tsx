import type { BreakdownPhoto } from '@pkg/schema/contracting';
import { useCallback } from 'react';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { breakdownPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';

export const breakdownPhotoQueryKey = (breakdownId: string, photoId: string) =>
  ['contracting-breakdown-photo', breakdownId, photoId] as const;

export async function fetchBreakdownPhoto(breakdownId: string, photoId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(breakdownPhotoUrl(breakdownId, photoId), { signal, credentials: 'include' });
  if (!response.ok) throw new Error('Unable to preview the photo.');
  return response.blob();
}

export function BreakdownPhotoPreview({
  breakdownId,
  subjectCode,
  photo,
  onClose,
}: {
  breakdownId: string;
  subjectCode: string;
  /** The photo to show; null keeps the sheet closed. */
  photo: BreakdownPhoto | null;
  onClose: () => void;
}) {
  const photoId = photo?.id ?? null;
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => {
      if (!photoId) throw new Error('No photo selected.');
      return fetchBreakdownPhoto(breakdownId, photoId, signal);
    },
    [breakdownId, photoId],
  );
  return (
    <FilePreviewSheet
      open={photo !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      description={`Breakdown on ${subjectCode}`}
      downloadFilename={(blob) => `${subjectCode}-breakdown.${blob.type === 'image/png' ? 'png' : 'jpg'}`}
      fetchBlob={fetchBlob}
      kind="image"
      queryKey={breakdownPhotoQueryKey(breakdownId, photoId ?? 'closed')}
      staleTime={Infinity}
      subject="Breakdown photo"
      title={`${subjectCode} photo`}
    />
  );
}
