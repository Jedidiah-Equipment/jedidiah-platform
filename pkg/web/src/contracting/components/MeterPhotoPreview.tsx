import { useCallback } from 'react';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { readingPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';

export const meterPhotoQueryKey = (readingId: string) => ['contracting-reading-photo', readingId] as const;

export async function fetchMeterPhoto(readingId: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(readingPhotoUrl(readingId), { signal, credentials: 'include' });
  if (!response.ok) throw new Error('Unable to preview meter photo.');
  return response.blob();
}

export function MeterPhotoPreview({
  photo,
  description,
  onClose,
}: {
  /** The photo to show; null keeps the sheet closed. */
  photo: { readingId: string; machineCode: string } | null;
  description: string;
  onClose: () => void;
}) {
  const readingId = photo?.readingId ?? null;
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => {
      if (!readingId) throw new Error('No meter photo selected.');
      return fetchMeterPhoto(readingId, signal);
    },
    [readingId],
  );
  return (
    <FilePreviewSheet
      open={photo !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      description={description}
      downloadFilename={(blob) =>
        `${photo?.machineCode ?? 'meter'}-reading.${blob.type === 'image/png' ? 'png' : 'jpg'}`
      }
      fetchBlob={fetchBlob}
      kind="image"
      queryKey={meterPhotoQueryKey(readingId ?? 'closed')}
      staleTime={Infinity}
      subject="meter photo"
      title={photo ? `${photo.machineCode} meter photo` : 'Meter photo'}
    />
  );
}
