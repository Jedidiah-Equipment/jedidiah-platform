import type { JobDocument } from '@pkg/schema';
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconMinus,
  IconPlus,
  IconShare,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { DocumentPage, type DocumentPageHandle, type DocumentPageMetrics } from '@/components/documents/DocumentPage';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { jobDocumentDownloadPath } from '@/lib/authed-fetch';
import { getOfflineAwareErrorMessage } from '@/lib/connectivity';
import { type DocumentAction, saveDocument, shareDocument } from '@/lib/document-actions';

/**
 * In-app document reader (#521): the DOCUMENT VIEWER screen from the mockup —
 * header (back, name + context, download, share), the PDF page area, and a footer
 * with the page counter and zoom controls. Full screen; rendered as its own route.
 * The page itself is rendered by the platform {@link DocumentPage}.
 */
export function DocumentViewer({
  jobId,
  document,
  context,
  onBack,
}: {
  jobId: string;
  document: JobDocument;
  /** Sub-label under the title, e.g. `JOB-00009 · Silage Grain 18 36`. */
  context: string;
  onBack: () => void;
}) {
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
      setActionError(
        getOfflineAwareErrorMessage(error, error instanceof Error ? error.message : 'Something went wrong.'),
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="flex-1 overflow-hidden bg-background">
      {/* Header: back, name + context, download, share. */}
      <View className="flex-row items-center gap-2.5 border-b border-border bg-surface px-3.5 py-3">
        <IconButton icon={IconChevronLeft} label="Back" onPress={onBack} />
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
          icon={IconDownload}
          label="Download document"
          onPress={run('save', saveDocument)}
        />
        <IconButton
          busy={busy === 'share'}
          disabled={busy !== null}
          icon={IconShare}
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
        <IconButton disabled={atFirst} icon={IconChevronLeft} label="Previous page" onPress={goPrev} />
        <Text className="text-xs text-foreground" weight="semibold">
          {page} / {pageCount ?? '–'}
        </Text>
        <View className="flex-row items-center gap-2">
          <IconButton icon={IconMinus} label="Zoom out" onPress={() => pageRef.current?.zoomOut()} small />
          <Text className="w-11 text-center text-[11px] text-muted-foreground">{zoomPercent}%</Text>
          <IconButton icon={IconPlus} label="Zoom in" onPress={() => pageRef.current?.zoomIn()} small />
        </View>
        <IconButton disabled={atLast} icon={IconChevronRight} label="Next page" onPress={goNext} />
      </View>
    </View>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  busy = false,
  small = false,
}: {
  icon: TablerIcon;
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
      {busy ? (
        <ActivityIndicator className="text-foreground" size="small" />
      ) : (
        <Icon icon={icon} size={small ? 18 : 20} />
      )}
    </Pressable>
  );
}
