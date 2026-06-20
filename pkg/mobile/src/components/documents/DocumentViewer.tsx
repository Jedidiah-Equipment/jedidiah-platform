import type { JobDocument } from '@pkg/schema';
import { useCallback, useRef, useState } from 'react';
import { Modal, Pressable, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentPage, type DocumentPageHandle, type DocumentPageMetrics } from '@/components/documents/DocumentPage';
import { Text } from '@/components/ui/text';
import { jobDocumentDownloadPath } from '@/lib/authed-fetch';
import { type DocumentAction, saveDocument, shareDocument } from '@/lib/document-actions';

/** At/above this width the reader floats as a centered card; below, it's full screen. */
const WIDE_BREAKPOINT = 760;

/**
 * In-app document reader (#521): the DOCUMENT VIEWER overlay from the mockup —
 * header (back, name + context, download, share), the PDF page area, and a footer
 * with the page counter and zoom controls. Full screen on phones; a centered card
 * on tablets. The page itself is rendered by the platform {@link DocumentPage}.
 */
export function DocumentViewer({
  jobId,
  document,
  context,
  onClose,
}: {
  jobId: string;
  document: JobDocument;
  /** Sub-label under the title, e.g. `JOB-00009 · Silage Grain 18 36`. */
  context: string;
  onClose: () => void;
}) {
  const isWide = useWindowDimensions().width >= WIDE_BREAKPOINT;
  const pageRef = useRef<DocumentPageHandle>(null);

  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const action: DocumentAction = { path: jobDocumentDownloadPath(jobId, document.id), filename: document.filename };

  // Stable so the web DocumentPage's fetch effect doesn't re-run each render.
  const onMetrics = useCallback((metrics: DocumentPageMetrics) => {
    setPage(metrics.page);
    setPageCount(metrics.pageCount);
  }, []);
  const onZoom = useCallback((percent: number) => setZoomPercent(percent), []);

  const goPrev = () => setPage((current) => Math.max(1, current - 1));
  const goNext = () => setPage((current) => (pageCount ? Math.min(pageCount, current + 1) : current + 1));
  const atFirst = page <= 1;
  const atLast = pageCount !== null && page >= pageCount;

  const run = (kind: 'save' | 'share', act: (a: DocumentAction) => Promise<void>) => async () => {
    if (busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      await act(action);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const reader = (
    <View className="flex-1 overflow-hidden bg-background">
      {/* Header: back, name + context, download, share. */}
      <View className="flex-row items-center gap-2.5 border-b border-border bg-surface px-3.5 py-3">
        <IconButton glyph="‹" label="Close document" onPress={onClose} />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] text-foreground" numberOfLines={1} weight="semibold">
            {document.filename}
          </Text>
          <Text className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground" numberOfLines={1}>
            {context}
          </Text>
        </View>
        <IconButton
          busy={busy === 'save'}
          disabled={busy !== null}
          glyph="⤓"
          label="Download document"
          onPress={run('save', saveDocument)}
        />
        <IconButton
          busy={busy === 'share'}
          disabled={busy !== null}
          glyph="⤴"
          label="Share document"
          onPress={run('share', shareDocument)}
        />
      </View>

      {actionError ? (
        <View className="bg-danger/10 px-4 py-2">
          <Text className="text-xs text-danger" numberOfLines={2}>
            {actionError}
          </Text>
        </View>
      ) : null}

      {/* Page area. */}
      <View className="flex-1 bg-muted">
        <DocumentPage
          filename={document.filename}
          onMetrics={onMetrics}
          onZoom={onZoom}
          page={page}
          path={action.path}
          ref={pageRef}
        />
      </View>

      {/* Footer: page counter + zoom controls. */}
      <View className="flex-row items-center justify-between border-t border-border bg-surface px-4 py-3">
        <IconButton disabled={atFirst} glyph="‹" label="Previous page" onPress={goPrev} />
        <Text className="text-xs text-foreground" weight="semibold">
          {page} / {pageCount ?? '–'}
        </Text>
        <View className="flex-row items-center gap-2">
          <IconButton glyph="−" label="Zoom out" onPress={() => pageRef.current?.zoomOut()} small />
          <Text className="w-11 text-center text-[11px] text-muted-foreground">{zoomPercent}%</Text>
          <IconButton glyph="+" label="Zoom in" onPress={() => pageRef.current?.zoomIn()} small />
        </View>
        <IconButton disabled={atLast} glyph="›" label="Next page" onPress={goNext} />
      </View>
    </View>
  );

  return (
    <Modal animationType={isWide ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent transparent visible>
      {isWide ? (
        // Tablet: a centered reader card over a dimmed backdrop. Layout-critical
        // sizing is inline (concrete values) rather than arbitrary NativeWind classes,
        // which don't reliably compile inside a portaled Modal subtree.
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 24,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 720,
              height: '92%',
              maxHeight: 960,
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            {reader}
          </View>
        </View>
      ) : (
        // Phone: full screen.
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
          {reader}
        </SafeAreaView>
      )}
    </Modal>
  );
}

function IconButton({
  glyph,
  label,
  onPress,
  disabled = false,
  busy = false,
  small = false,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  small?: boolean;
}) {
  const size = small ? 'h-9 w-9' : 'h-10 w-10';

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      className={`${size} items-center justify-center rounded-xl border border-border bg-background active:bg-muted ${
        disabled || busy ? 'opacity-40' : ''
      }`}
      disabled={disabled || busy}
      onPress={onPress}
    >
      <Text className="text-base leading-5 text-foreground" weight="semibold">
        {busy ? '…' : glyph}
      </Text>
    </Pressable>
  );
}
