import { getJobDisplayName } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { Text } from '@/components/ui/text';
import { jobDocumentDownloadPath, productDocumentDownloadPath } from '@/lib/authed-fetch';
import { useTRPC } from '@/lib/trpc';

/**
 * Full-screen reader for a Job or Product document. Each context is rebuilt from
 * its own read so deep links need only the document id plus its owner id.
 */
export default function DocumentViewerRoute() {
  const router = useRouter();
  const { documentId, jobId, productId } = useLocalSearchParams<{
    documentId: string;
    jobId?: string;
    productId?: string;
  }>();
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId ?? '' }, { enabled: Boolean(jobId) }));
  const productQuery = useQuery(
    trpc.products.get.queryOptions({ id: productId ?? '' }, { enabled: Boolean(productId) }),
  );
  const productDocumentsQuery = useQuery(
    trpc.documents.listByProduct.queryOptions({ productId: productId ?? '' }, { enabled: Boolean(productId) }),
  );
  const productContext = Boolean(productId);
  const queryPending = productContext ? productQuery.isPending || productDocumentsQuery.isPending : jobQuery.isPending;
  const queryError = productContext ? productQuery.isError || productDocumentsQuery.isError : jobQuery.isError;
  const document = productContext
    ? productDocumentsQuery.data?.find((candidate) => candidate.id === documentId)
    : jobQuery.data?.documents.find((candidate) => candidate.id === documentId);
  const context = productContext
    ? productQuery.data
      ? `${productQuery.data.modelCode} · ${productQuery.data.name}`
      : null
    : jobQuery.data
      ? `${jobQuery.data.code} · ${getJobDisplayName(jobQuery.data)}`
      : null;
  const downloadPath = productContext
    ? productDocumentDownloadPath(productId ?? '', documentId)
    : jobDocumentDownloadPath(jobId ?? '', documentId);

  // Opened as a deep link / initial route, there's no entry to pop, so fall back
  // to the owning tab rather than leaving `router.back()` a dead-end no-op.
  const handleBack = () => (router.canGoBack() ? router.back() : router.replace(productContext ? '/products' : '/'));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      {!jobId && !productId ? (
        <Message onBack={handleBack} text="This document link is incomplete." />
      ) : queryPending ? (
        <Message text="Loading document…" />
      ) : queryError ? (
        <Message onBack={handleBack} text="Couldn’t load this document." />
      ) : !document || !context ? (
        <Message onBack={handleBack} text="This document is no longer available." />
      ) : (
        <DocumentViewer context={context} document={document} downloadPath={downloadPath} onBack={handleBack} />
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
