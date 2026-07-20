import { getJobDisplayName, isBrochureReady } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { Text } from '@/components/ui/text';
import { jobDocumentDownloadPath, productBrochurePreviewPath, productDocumentDownloadPath } from '@/lib/authed-fetch';
import { PRODUCT_BROCHURE_DOCUMENT_ID, productBrochureFilename } from '@/lib/product-brochure';
import { useTRPC } from '@/lib/trpc';

/**
 * Full-screen reader for a Job or Product document. The owning context is picked
 * once from the route params; each context component rebuilds its own read so
 * deep links need only the document id plus its owner id.
 */
export default function DocumentViewerRoute() {
  const router = useRouter();
  const { documentId, jobId, productId } = useLocalSearchParams<{
    documentId: string;
    jobId?: string;
    productId?: string;
  }>();

  // Opened as a deep link / initial route, there's no entry to pop, so fall back
  // to the owning tab rather than leaving `router.back()` a dead-end no-op.
  const handleBack = () => (router.canGoBack() ? router.back() : router.replace(productId ? '/products' : '/'));

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
      {productId ? (
        documentId === PRODUCT_BROCHURE_DOCUMENT_ID ? (
          <BrochureScreen onBack={handleBack} productId={productId} />
        ) : (
          <ProductDocumentScreen documentId={documentId} onBack={handleBack} productId={productId} />
        )
      ) : jobId ? (
        <JobDocumentScreen documentId={documentId} jobId={jobId} onBack={handleBack} />
      ) : (
        <Message onBack={handleBack} text="This document link is incomplete." />
      )}
    </SafeAreaView>
  );
}

function JobDocumentScreen({ jobId, documentId, onBack }: { jobId: string; documentId: string; onBack: () => void }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const document = query.data?.documents.find((candidate) => candidate.id === documentId);

  if (query.isPending) return <Message text="Loading document…" />;
  if (query.isError) return <Message onBack={onBack} text="Couldn’t load this document." />;
  if (!document) return <Message onBack={onBack} text="This document is no longer available." />;

  return (
    <DocumentViewer
      context={`${query.data.code} · ${getJobDisplayName(query.data)}`}
      document={document}
      downloadPath={jobDocumentDownloadPath(jobId, documentId)}
      onBack={onBack}
    />
  );
}

function ProductDocumentScreen({
  productId,
  documentId,
  onBack,
}: {
  productId: string;
  documentId: string;
  onBack: () => void;
}) {
  const trpc = useTRPC();
  const productQuery = useQuery(trpc.products.get.queryOptions({ id: productId }));
  const documentsQuery = useQuery(trpc.documents.listByProduct.queryOptions({ productId }));
  const document = documentsQuery.data?.find((candidate) => candidate.id === documentId);

  if (productQuery.isPending || documentsQuery.isPending) return <Message text="Loading document…" />;
  if (productQuery.isError || documentsQuery.isError) {
    return <Message onBack={onBack} text="Couldn’t load this document." />;
  }
  if (!document) return <Message onBack={onBack} text="This document is no longer available." />;

  return (
    <DocumentViewer
      context={`${productQuery.data.modelCode} · ${productQuery.data.name}`}
      document={document}
      downloadPath={productDocumentDownloadPath(productId, documentId)}
      onBack={onBack}
    />
  );
}

function BrochureScreen({ productId, onBack }: { productId: string; onBack: () => void }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.products.get.queryOptions({ id: productId }));

  if (query.isPending) return <Message text="Loading document…" />;
  if (query.isError) return <Message onBack={onBack} text="Couldn’t load this document." />;
  if (!isBrochureReady(query.data)) return <Message onBack={onBack} text="This document is no longer available." />;

  return (
    <DocumentViewer
      context={`${query.data.modelCode} · ${query.data.name}`}
      document={{ filename: productBrochureFilename(query.data.modelCode) }}
      downloadPath={productBrochurePreviewPath(productId)}
      onBack={onBack}
    />
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
