import { getJobDisplayName, getQuoteOfferingName, isBrochureReady } from '@pkg/domain';
import type { DocumentSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { DocumentViewer } from '@/components/documents/DocumentViewer';
import { Text } from '@/components/ui/text';
import {
  jobDocumentDownloadPath,
  productBrochurePreviewPath,
  productDocumentDownloadPath,
  quoteDocumentDownloadPath,
} from '@/lib/authed-fetch';
import { PRODUCT_BROCHURE_DOCUMENT_ID, productBrochureFilename } from '@/lib/product-brochure';
import { useTRPC } from '@/lib/trpc';

/**
 * Full-screen reader for a Job, Product, or Quote document. The owning context is picked
 * once from the route params; each context component rebuilds its own read so
 * deep links need only the document id plus its owner id.
 */
export default function DocumentViewerRoute() {
  const router = useRouter();
  const { documentId, jobId, productId, quoteId } = useLocalSearchParams<{
    documentId: string;
    jobId?: string;
    productId?: string;
    quoteId?: string;
  }>();
  const owner = productId
    ? ({ fallback: () => router.replace('/products'), id: productId, kind: 'product' } as const)
    : jobId
      ? ({ fallback: () => router.replace('/'), id: jobId, kind: 'job' } as const)
      : quoteId
        ? ({
            fallback: () => router.replace({ pathname: '/quotes/[quoteId]', params: { quoteId } }),
            id: quoteId,
            kind: 'quote',
          } as const)
        : null;

  // Opened as a deep link / initial route, there's no entry to pop, so fall back
  // to the owning tab rather than leaving `router.back()` a dead-end no-op.
  const handleBack = () => {
    if (router.canGoBack()) return router.back();
    return owner?.fallback() ?? router.replace('/');
  };

  return (
    // The full-screen modal is a react-native-screens route root, so it must measure
    // its own insets instead of inheriting the provider frame behind the modal.
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
        {owner ? (
          <OwnerDocumentScreen documentId={documentId} onBack={handleBack} owner={owner} />
        ) : (
          <Message onBack={handleBack} text="This document link is incomplete." />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function OwnerDocumentScreen({
  documentId,
  onBack,
  owner,
}: {
  documentId: string;
  onBack: () => void;
  owner: { id: string; kind: 'job' } | { id: string; kind: 'product' } | { id: string; kind: 'quote' };
}) {
  switch (owner.kind) {
    case 'job':
      return <JobDocumentScreen documentId={documentId} jobId={owner.id} onBack={onBack} />;
    case 'product':
      return documentId === PRODUCT_BROCHURE_DOCUMENT_ID ? (
        <BrochureScreen onBack={onBack} productId={owner.id} />
      ) : (
        <ProductDocumentScreen documentId={documentId} onBack={onBack} productId={owner.id} />
      );
    case 'quote':
      return <QuoteDocumentScreen documentId={documentId} onBack={onBack} quoteId={owner.id} />;
  }
}

function QuoteDocumentScreen({
  documentId,
  onBack,
  quoteId,
}: {
  documentId: string;
  onBack: () => void;
  quoteId: string;
}) {
  const trpc = useTRPC();
  const quoteQuery = useQuery(trpc.quotes.get.queryOptions({ id: quoteId }));
  const documentsQuery = useQuery(trpc.documents.listByQuote.queryOptions({ quoteId }));
  const document = documentsQuery.data?.find((candidate) => candidate.id === documentId);

  return (
    <DocumentViewerState
      context={quoteQuery.data ? `${quoteQuery.data.code} · ${getQuoteOfferingName(quoteQuery.data)}` : null}
      document={document}
      downloadPath={quoteDocumentDownloadPath(quoteId, documentId)}
      isError={quoteQuery.isError || documentsQuery.isError}
      isPending={quoteQuery.isPending || documentsQuery.isPending}
      onBack={onBack}
    />
  );
}

function JobDocumentScreen({ jobId, documentId, onBack }: { jobId: string; documentId: string; onBack: () => void }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const document = query.data?.documents.find((candidate) => candidate.id === documentId);

  return (
    <DocumentViewerState
      context={query.data ? `${query.data.code} · ${getJobDisplayName(query.data)}` : null}
      document={document}
      downloadPath={jobDocumentDownloadPath(jobId, documentId)}
      isError={query.isError}
      isPending={query.isPending}
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

  return (
    <DocumentViewerState
      context={productQuery.data ? `${productQuery.data.modelCode} · ${productQuery.data.name}` : null}
      document={document}
      downloadPath={productDocumentDownloadPath(productId, documentId)}
      isError={productQuery.isError || documentsQuery.isError}
      isPending={productQuery.isPending || documentsQuery.isPending}
      onBack={onBack}
    />
  );
}

function DocumentViewerState({
  context,
  document,
  downloadPath,
  isError,
  isPending,
  onBack,
}: {
  context: string | null;
  document: Pick<DocumentSummary, 'contentType' | 'filename'> | null | undefined;
  downloadPath: string;
  isError: boolean;
  isPending: boolean;
  onBack: () => void;
}) {
  if (isPending) return <Message text="Loading document…" />;
  if (isError) return <Message onBack={onBack} text="Couldn’t load this document." />;
  if (context === null) return <Message onBack={onBack} text="Couldn’t load this document." />;
  if (!document) return <Message onBack={onBack} text="This document is no longer available." />;

  return <DocumentViewer context={context} document={document} downloadPath={downloadPath} onBack={onBack} />;
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
      document={{ contentType: 'application/pdf', filename: productBrochureFilename(query.data.modelCode) }}
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
