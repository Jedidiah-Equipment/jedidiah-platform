import { formatBytes, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import type { JobDocument } from '@pkg/schema';
import { IconChevronRight, IconDownload } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

/**
 * The DOCUMENTS card shared by the Job Slot detail pane (#520) and Job Detail (#615): fetched with
 * `jobs.get` (cached when reached from either screen) and opened in the existing viewer route, which
 * rebuilds its own context from the same `jobs.get` read. Owns its loading, error, and empty states.
 */
export function JobDocuments({ jobId }: { jobId: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const documents = query.data?.documents ?? [];

  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
        {query.isSuccess ? `DOCUMENTS · ${documents.length}` : 'DOCUMENTS'}
      </Text>
      {query.isPending ? (
        <Text className="py-2 text-sm text-muted-foreground">Loading documents…</Text>
      ) : query.isError ? (
        <Text className="py-2 text-sm text-danger">Couldn’t load documents.</Text>
      ) : documents.length === 0 ? (
        <Text className="py-2 text-sm text-muted-foreground">No documents for this job.</Text>
      ) : (
        documents.map((document) => (
          <DocumentRow
            document={document}
            key={document.id}
            onOpen={() =>
              router.push({ pathname: '/documents/[documentId]', params: { documentId: document.id, jobId } })
            }
          />
        ))
      )}
    </View>
  );
}

function DocumentRow({ document, onOpen }: { document: JobDocument; onOpen: () => void }) {
  const meta = `${PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]} · ${formatBytes(document.byteSize)}`;

  return (
    <Pressable
      accessibilityHint="Opens the document viewer"
      accessibilityRole="button"
      className="flex-row items-center gap-3 border-t border-border py-3 active:opacity-70"
      onPress={onOpen}
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
      <Icon className="text-muted-foreground" icon={IconChevronRight} size={18} />
    </Pressable>
  );
}
