import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { OfflineState, RetryLoadState } from '@/components/OfflineNotice';
import { Text } from '@/components/ui/text';
import { authedFetch } from '@/lib/authed-fetch';
import { useConnectivity } from '@/lib/connectivity';

import type { DocumentPageHandle, DocumentPageProps } from './DocumentPage';

export type { DocumentPageHandle, DocumentPageMetrics, DocumentPageProps } from './DocumentPage';

/**
 * Web PDF page renderer (#521): the browser owns the cookie jar, so `authedFetch`
 * carries the session automatically. The bytes become an object URL shown in an
 * iframe — `react-native-web` renders the raw DOM tag through react-dom — and the
 * browser's own viewer handles paging and zoom, so the footer controls no-op here.
 */
export const DocumentPage = forwardRef<DocumentPageHandle, DocumentPageProps>(function DocumentPage(
  { path, filename, onMetrics, onZoom },
  ref,
) {
  const connectivity = useConnectivity();
  const wasOffline = useRef(connectivity.isOffline);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const request = useMemo(() => ({ path, retryKey }), [path, retryKey]);
  const retry = useCallback(() => {
    setFailed(false);
    void connectivity.refresh().finally(() => setRetryKey((key) => key + 1));
  }, [connectivity]);

  useImperativeHandle(ref, () => ({ zoomIn: () => {}, zoomOut: () => {} }));

  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;
    setFailed(false);
    setBlobUrl(null);

    authedFetch(request.path)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        const blob = await response.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
        onMetrics({ page: 1, pageCount: null });
        onZoom(100);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [request, onMetrics, onZoom]);

  useEffect(() => {
    const reconnected = wasOffline.current && !connectivity.isOffline;
    wasOffline.current = connectivity.isOffline;

    if (reconnected && failed && !blobUrl) {
      setRetryKey((key) => key + 1);
    }
  }, [blobUrl, connectivity.isOffline, failed]);

  if (connectivity.isOffline && !blobUrl) {
    return (
      <Centered>
        <OfflineState onRetry={retry} />
      </Centered>
    );
  }

  if (failed) {
    return (
      <Centered>
        <RetryLoadState
          message="Go back and try again, or check your connection."
          onRetry={retry}
          title="Couldn’t open this document."
        />
      </Centered>
    );
  }

  if (!blobUrl) {
    return (
      <Centered>
        <Text className="text-sm text-muted-foreground">Loading document…</Text>
      </Centered>
    );
  }

  return (
    <View className="flex-1">
      <iframe
        src={blobUrl}
        style={{ flex: 1, width: '100%', height: '100%', border: 'none', backgroundColor: '#fff' }}
        title={filename}
      />
    </View>
  );
});

function Centered({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center px-8">{children}</View>;
}
