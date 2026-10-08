import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

// Fetches an image as a credentialed blob and exposes a temporary object URL for preview. Shared by
// every image kept in private object storage (brochure slots, Product Range image, Breakdown photos). Key the
// query by the image's `updatedAt` so a replace busts the cache and the superseded object URL is revoked.
export function useCredentialedImagePreviewState({
  enabled,
  fetchBlob,
  queryKey,
}: {
  enabled: boolean;
  // React Query always supplies an abort signal to the query function, so callers receive a defined one.
  fetchBlob: (args: { signal: AbortSignal }) => Promise<Blob>;
  queryKey: readonly unknown[];
}) {
  const previewQuery = useQuery({
    enabled,
    queryFn: ({ signal }) => fetchBlob({ signal }),
    queryKey,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const blob = previewQuery.data ?? null;
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setObjectUrl(null);
      return;
    }

    const url = URL.createObjectURL(blob);
    setObjectUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return { url: objectUrl, error: previewQuery.error, isLoading: enabled && !objectUrl && !previewQuery.isError };
}

// The URL-only view remains convenient for small catalogue thumbnails.
export function useCredentialedImagePreview(
  options: Parameters<typeof useCredentialedImagePreviewState>[0],
): string | null {
  return useCredentialedImagePreviewState(options).url;
}
