import { formatBytes } from '@pkg/domain';
import { JOB_DOCUMENT_TYPE_LABELS } from '@pkg/domain/equipment';
import type { JobVisibleDocument } from '@pkg/schema/equipment';
import { IconChevronRight, IconDownload } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { JobSectionCard } from '@/equipment/components/bays/JobSectionCard';
import { useDocumentDownload } from '@/equipment/hooks/use-document-download';
import { getDocumentListAction } from '@/equipment/lib/document-content';
import { jobDocumentDownloadPath } from '@/equipment/lib/equipment-http-paths';

/**
 * The DOCUMENTS card shared by the Job Slot detail pane (#520) and Job Detail (#615): the job's
 * documents from the cached `jobs.get` read. Previewable PDFs open the existing viewer route; formats
 * without an in-app renderer remain download-only from the list.
 */
export function JobDocuments({ jobId }: { jobId: string }) {
  const router = useRouter();

  return (
    <JobSectionCard<JobVisibleDocument>
      jobId={jobId}
      noun="documents"
      renderItem={(document) => (
        <DocumentRow
          document={document}
          downloadPath={jobDocumentDownloadPath(jobId, document.id)}
          key={document.id}
          onOpen={() =>
            router.push({ pathname: '/equipment/documents/[documentId]', params: { documentId: document.id, jobId } })
          }
        />
      )}
      select={(data) => data.documents}
      title="DOCUMENTS"
    />
  );
}

function DocumentRow({
  document,
  downloadPath,
  onOpen,
}: {
  document: JobVisibleDocument;
  downloadPath: string;
  onOpen: () => void;
}) {
  const { download, isDownloading } = useDocumentDownload({
    contentType: document.contentType,
    filename: document.filename,
    path: downloadPath,
  });
  const canPreview = getDocumentListAction(document.contentType) === 'preview';
  const meta = `${JOB_DOCUMENT_TYPE_LABELS[document.metadata.type]} · ${formatBytes(document.byteSize)}`;

  return (
    <Pressable
      accessibilityHint={canPreview ? 'Opens the document viewer' : 'Downloads the document'}
      accessibilityRole="button"
      accessibilityState={{ busy: isDownloading, disabled: isDownloading }}
      className="flex-row items-center gap-3 border-t border-border py-3 active:opacity-70"
      disabled={isDownloading}
      onPress={canPreview ? onOpen : () => void download()}
    >
      <View className="h-10 w-10 items-center justify-center rounded-lg border border-primary/25 bg-primary/10">
        <Icon className="text-primary" icon={IconDownload} size={18} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm text-surface-foreground" weight="semibold" numberOfLines={1}>
          {document.filename}
        </Text>
        <Text className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">{meta}</Text>
      </View>
      {isDownloading ? (
        <ActivityIndicator size="small" />
      ) : (
        <Icon className="text-muted-foreground" icon={canPreview ? IconChevronRight : IconDownload} size={18} />
      )}
    </Pressable>
  );
}
