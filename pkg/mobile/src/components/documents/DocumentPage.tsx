import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { View } from 'react-native';
import Pdf from 'react-native-pdf';

import { Text } from '@/components/ui/text';
import { downloadDocumentToCache } from '@/lib/document-actions';

/** Current page (1-based) and total page count, surfaced to the viewer footer. */
export type DocumentPageMetrics = { page: number; pageCount: number | null };

/** Imperative zoom controls the viewer footer drives. */
export type DocumentPageHandle = { zoomIn: () => void; zoomOut: () => void };

export type DocumentPageProps = {
  /** Authed download route for the document bytes. */
  path: string;
  filename: string;
  /** Page to display (1-based); the viewer's prev/next buttons drive this. */
  page: number;
  onMetrics: (metrics: DocumentPageMetrics) => void;
  onZoom: (percent: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 3;
const SCALE_STEP = 0.25;
const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * Native PDF page renderer (#521): fetches the authed document through the same checked
 * download path as Save/Share, then gives `react-native-pdf` a local file. Android's
 * `react-native-pdf` URL cache can otherwise preserve a transient auth/error response
 * as the PDF bytes.
 */
export const DocumentPage = forwardRef<DocumentPageHandle, DocumentPageProps>(function DocumentPage(
  { path, filename, page, onMetrics, onZoom },
  ref,
) {
  const [scale, setScale] = useState(MIN_SCALE);
  const liveScale = useRef(MIN_SCALE);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [localUri, setLocalUri] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => setScale(clampScale(liveScale.current + SCALE_STEP)),
    zoomOut: () => setScale(clampScale(liveScale.current - SCALE_STEP)),
  }));

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setFailed(false);
    setLocalUri(null);

    // Native downloads cannot be cancelled here, so the viewer cache must not collide on filename alone.
    downloadDocumentToCache({ path, filename, cacheKey: path })
      .then((uri) => {
        if (!cancelled) setLocalUri(uri);
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false);
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [path, filename]);

  if (failed) {
    return (
      <Centered>
        <Text className="text-sm text-foreground" weight="semibold">
          Couldn’t open this document.
        </Text>
        <Text className="mt-1 text-center text-xs text-muted-foreground">
          Go back and try again, or check your connection.
        </Text>
      </Centered>
    );
  }

  if (!localUri) {
    return (
      <Centered>
        <Text className="text-sm text-muted-foreground">Loading document…</Text>
      </Centered>
    );
  }

  return (
    <View className="flex-1">
      <Pdf
        enablePaging={false}
        fitPolicy={0}
        maxScale={MAX_SCALE}
        minScale={MIN_SCALE}
        onError={() => {
          setLoading(false);
          setFailed(true);
        }}
        onLoadComplete={(numberOfPages) => {
          setLoading(false);
          onMetrics({ page, pageCount: numberOfPages });
        }}
        onPageChanged={(currentPage, numberOfPages) => onMetrics({ page: currentPage, pageCount: numberOfPages })}
        onScaleChanged={(nextScale) => {
          liveScale.current = nextScale;
          onZoom(Math.round(nextScale * 100));
        }}
        page={page}
        scale={scale}
        source={{ uri: localUri, cache: false }}
        spacing={8}
        style={{ flex: 1, width: '100%', backgroundColor: 'transparent' }}
        trustAllCerts={false}
      />
      {loading ? (
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-sm text-muted-foreground">Loading document…</Text>
        </View>
      ) : null}
    </View>
  );
});

function Centered({ children }: { children: React.ReactNode }) {
  return <View className="flex-1 items-center justify-center px-8">{children}</View>;
}
