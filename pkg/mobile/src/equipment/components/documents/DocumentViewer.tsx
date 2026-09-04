import type { DocumentSummary } from '@pkg/schema/equipment';
import { IconDownload, IconShare, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { DocumentPage } from '@/equipment/components/documents/DocumentPage';
import { SecondaryPageToolbar } from '@/equipment/components/TopToolbar';
import { type DocumentAction, saveDocument, shareDocument } from '@/equipment/lib/document-actions';
import { canPreviewDocument } from '@/equipment/lib/document-content';

/**
 * In-app document reader (#521): the DOCUMENT VIEWER screen from the mockup —
 * standard secondary toolbar above document actions and a full-screen preview area.
 * PDFs render through the platform {@link DocumentPage}; download-only formats show
 * an explicit unavailable state without invoking the PDF renderer.
 */
export function DocumentViewer({
  downloadPath,
  document,
  context,
  onBack,
  parentLabel,
}: {
  downloadPath: string;
  document: Pick<DocumentSummary, 'contentType' | 'filename'>;
  /** Sub-label under the title, e.g. `JOB-00009 · Silage Grain 18 36`. */
  context: string;
  onBack: () => void;
  parentLabel: string;
}) {
  const [busy, setBusy] = useState<null | 'save' | 'share'>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const action: DocumentAction = {
    contentType: document.contentType,
    path: downloadPath,
    filename: document.filename,
  };
  const canPreview = canPreviewDocument(document.contentType);

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
      <SecondaryPageToolbar onBack={onBack} parentLabel={parentLabel} subtitle={context} title={document.filename} />
      <View className="flex-row justify-end gap-2 px-4 py-3">
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
        {canPreview ? (
          <DocumentPage filename={document.filename} path={action.path} />
        ) : (
          <View className="flex-1 items-center justify-center gap-2 px-6">
            <Text className="text-base text-foreground" weight="semibold">
              Preview unavailable
            </Text>
            <Text className="text-center text-sm text-muted-foreground">
              Download or share this file to open it in another app.
            </Text>
          </View>
        )}
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
}: {
  icon: TablerIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      className={`h-10 w-10 items-center justify-center rounded-xl border border-border bg-background active:bg-muted ${
        disabled || busy ? 'opacity-40' : ''
      }`}
      disabled={disabled || busy}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator className="text-foreground" size="small" /> : <Icon icon={icon} size={20} />}
    </Pressable>
  );
}
