import { getJobDisplayName, getQuoteOfferingName, isBrochureReady } from '@pkg/domain';
import type { DocumentSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { DocumentViewer } from '@/equipment/components/documents/DocumentViewer';
import { SecondaryPageToolbar } from '@/equipment/components/TopToolbar';
import { PRODUCT_BROCHURE_DOCUMENT_ID, productBrochureFilename } from '@/equipment/lib/product-brochure';
import { type DocumentParent, resolveDocumentParent } from '@/equipment/lib/toolbar-navigation';
import {
  jobDocumentDownloadPath,
  productBrochurePreviewPath,
  productDocumentDownloadPath,
  quoteDocumentDownloadPath,
} from '@/lib/authed-fetch';
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
  const owner = resolveDocumentParent({ jobId, productId, quoteId });

  const handleBack = () => (owner ? router.dismissTo(owner.returnTo) : router.dismissTo('/'));

  return (
    // The full-screen modal is a react-native-screens route root, so it must measure
    // its own insets instead of inheriting the provider frame behind the modal.
    <SafeAreaProvider>
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
        {owner ? (
          <OwnerDocumentScreen documentId={documentId} onBack={handleBack} owner={owner} />
        ) : (
          <Message onBack={handleBack} parentLabel="Jobs" text="This document link is incomplete." />
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
  owner: DocumentParent;
}) {
  switch (owner.kind) {
    case 'job':
      return (
        <JobDocumentScreen documentId={documentId} jobId={owner.id} onBack={onBack} parentLabel={owner.parentLabel} />
      );
    case 'product':
      return documentId === PRODUCT_BROCHURE_DOCUMENT_ID ? (
        <BrochureScreen onBack={onBack} parentLabel={owner.parentLabel} productId={owner.id} />
      ) : (
        <ProductDocumentScreen
          documentId={documentId}
          onBack={onBack}
          parentLabel={owner.parentLabel}
          productId={owner.id}
        />
      );
    case 'quote':
      return (
        <QuoteDocumentScreen
          documentId={documentId}
          onBack={onBack}
          parentLabel={owner.parentLabel}
          quoteId={owner.id}
        />
      );
  }
}

function QuoteDocumentScreen({
  documentId,
  onBack,
  parentLabel,
  quoteId,
}: {
  documentId: string;
  onBack: () => void;
  parentLabel: string;
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
      parentLabel={parentLabel}
    />
  );
}

function JobDocumentScreen({
  jobId,
  documentId,
  onBack,
  parentLabel,
}: {
  jobId: string;
  documentId: string;
  onBack: () => void;
  parentLabel: string;
}) {
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
      parentLabel={parentLabel}
    />
  );
}

function ProductDocumentScreen({
  productId,
  documentId,
  onBack,
  parentLabel,
}: {
  productId: string;
  documentId: string;
  onBack: () => void;
  parentLabel: string;
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
      parentLabel={parentLabel}
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
  parentLabel,
}: {
  context: string | null;
  document: Pick<DocumentSummary, 'contentType' | 'filename'> | null | undefined;
  downloadPath: string;
  isError: boolean;
  isPending: boolean;
  onBack: () => void;
  parentLabel: string;
}) {
  if (isPending) return <Message onBack={onBack} parentLabel={parentLabel} text="Loading document…" />;
  if (isError) return <Message onBack={onBack} parentLabel={parentLabel} text="Couldn’t load this document." />;
  if (context === null)
    return <Message onBack={onBack} parentLabel={parentLabel} text="Couldn’t load this document." />;
  if (!document)
    return <Message onBack={onBack} parentLabel={parentLabel} text="This document is no longer available." />;

  return (
    <DocumentViewer
      context={context}
      document={document}
      downloadPath={downloadPath}
      onBack={onBack}
      parentLabel={parentLabel}
    />
  );
}

function BrochureScreen({
  productId,
  onBack,
  parentLabel,
}: {
  productId: string;
  onBack: () => void;
  parentLabel: string;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.products.get.queryOptions({ id: productId }));

  if (query.isPending) return <Message onBack={onBack} parentLabel={parentLabel} text="Loading document…" />;
  if (query.isError) return <Message onBack={onBack} parentLabel={parentLabel} text="Couldn’t load this document." />;
  if (!isBrochureReady(query.data)) {
    return <Message onBack={onBack} parentLabel={parentLabel} text="This document is no longer available." />;
  }

  return (
    <DocumentViewer
      context={`${query.data.modelCode} · ${query.data.name}`}
      document={{ contentType: 'application/pdf', filename: productBrochureFilename(query.data.modelCode) }}
      downloadPath={productBrochurePreviewPath(productId)}
      onBack={onBack}
      parentLabel={parentLabel}
    />
  );
}

function Message({ text, onBack, parentLabel }: { text: string; onBack: () => void; parentLabel: string }) {
  return (
    <View className="flex-1">
      <SecondaryPageToolbar onBack={onBack} parentLabel={parentLabel} subtitle="DOCUMENT VIEWER" title="Document" />
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-center text-sm text-muted-foreground">{text}</Text>
      </View>
    </View>
  );
}
