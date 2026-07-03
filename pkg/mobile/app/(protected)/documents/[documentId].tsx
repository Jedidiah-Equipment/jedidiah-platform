import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { Text } from '@/components/ui/text';
import { getJobDisplayName } from '@/lib/job-display';
import { useTRPC } from '@/lib/trpc';

/**
 * Document viewer route (#521): the dedicated full-screen reader for one Job
 * document. The job is refetched with `jobs.get` (already cached when reached
 * from the Job Slot detail pane), the document is located by id, and the context
 * sub-label is rebuilt from the job — so only `documentId` + `jobId` need to ride
 * the navigation.
 */
export default function DocumentViewerRoute() {
  const router = useRouter();
  const { documentId, jobId } = useLocalSearchParams<{ documentId: string; jobId: string }>();
  const trpc = useTRPC();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const document = query.data?.documents.find((candidate) => candidate.id === documentId);

  // Opened as a deep link / initial route, there's no entry to pop, so fall back
  // to the Bay List rather than leaving `router.back()` a dead-end no-op.
  const handleBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      {query.isPending ? (
        <Message text="Loading document…" />
      ) : query.isError ? (
        <Message onBack={handleBack} text="Couldn’t load this document." />
      ) : !document ? (
        <Message onBack={handleBack} text="This document is no longer available." />
      ) : (
        <DocumentViewer
          context={`${query.data.code} · ${getJobDisplayName(query.data)}`}
          document={document}
          jobId={jobId}
          onBack={handleBack}
        />
      )}
    </SafeAreaView>
  );
}

function Message({ text, onBack }: { text: string; onBack?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <Text className="text-center text-sm text-muted-foreground">{text}</Text>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          className="rounded-xl border border-border bg-background px-4 py-2 active:bg-muted"
          onPress={onBack}
        >
          <Text className="text-sm text-foreground" weight="semibold">
            Go back
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
