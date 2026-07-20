import type { DocumentSummary } from '@pkg/schema';
import { IconChevronLeft, IconDownload, IconShare, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { DocumentPage } from '@/components/documents/DocumentPage';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { type DocumentAction, saveDocument, shareDocument } from '@/lib/document-actions';

/**
 * In-app document reader (#521): the DOCUMENT VIEWER screen from the mockup —
 * header (back, name + context, download, share) above a full-screen PDF page area.
 * Scrolling and pinch-zoom are handled natively, so there is no footer. The page
 * itself is rendered by the platform {@link DocumentPage}.
 */
export function DocumentViewer({
  downloadPath,
  document,
  context,
  onBack,
}: {
  downloadPath: string;
  document: Pick<DocumentSummary, 'filename'>;
  /** Sub-label under the title, e.g. `JOB-00009 · Silage Grain 18 36`. */
  context: string;
  onBack: () => void;
}) {
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const action: DocumentAction = { path: downloadPath, filename: document.filename };

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
        <DocumentPage filename={document.filename} path={action.path} />
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
