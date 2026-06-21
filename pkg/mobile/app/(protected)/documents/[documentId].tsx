import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { Text } from '@/components/ui/text';
import { offlineMessage, offlineTitle, useConnectivity } from '@/lib/connectivity';
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
  const connectivity = useConnectivity();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = query.data;
  const document = job?.documents.find((candidate) => candidate.id === documentId);
  const retry = useCallback(() => {
    void connectivity.refresh();
    void query.refetch();
  }, [connectivity, query]);
  const isOfflineWithoutData = !query.data && (connectivity.isOffline || query.fetchStatus === 'paused');

  // Opened as a deep link / initial route, there's no entry to pop, so fall back
  // to the Bay List rather than leaving `router.back()` a dead-end no-op.
  const handleBack = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      {job && document ? (
        <DocumentViewer
          context={`${job.code} · ${job.productName}`}
          document={document}
          jobId={jobId}
          onBack={handleBack}
        />
      ) : isOfflineWithoutData ? (
        <Message onBack={handleBack} onRetry={retry} text={offlineMessage} title={offlineTitle} />
      ) : query.isPending ? (
        <Message text="Loading document…" />
      ) : query.isError ? (
        <Message
          onBack={handleBack}
          onRetry={retry}
          text="Try again, or check your connection."
          title="Couldn’t load this document."
        />
      ) : !document ? (
        <Message onBack={handleBack} text="This document is no longer available." />
      ) : null}
    </SafeAreaView>
  );
}

function Message({
  text,
  title,
  onBack,
  onRetry,
}: {
  text: string;
  title?: string;
  onBack?: () => void;
  onRetry?: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <View>
        {title ? (
          <Text className="text-center text-sm text-foreground" weight="semibold">
            {title}
          </Text>
        ) : null}
        <Text className={`text-center text-sm text-muted-foreground ${title ? 'mt-1' : ''}`}>{text}</Text>
      </View>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          className="rounded-xl border border-border bg-surface px-4 py-2 active:bg-muted"
          onPress={onRetry}
        >
          <Text className="text-sm text-foreground" weight="semibold">
            Retry
          </Text>
        </Pressable>
      ) : null}
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
