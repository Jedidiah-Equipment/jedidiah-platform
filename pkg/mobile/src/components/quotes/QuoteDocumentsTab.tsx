import { canGenerateQuoteDocument } from '@pkg/domain';
import type { QuoteDetail, QuoteDocument, QuoteDocumentGenerationWarning } from '@pkg/schema';
import {
  IconArrowsSort,
  IconDownload,
  IconEye,
  IconFilePlus,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { type ListControlOption, ListDropdownControl, ListSearchControl } from '@/components/ListControls';
import { GenerateQuoteDocumentModal } from '@/components/quotes/GenerateQuoteDocumentModal';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { quoteDocumentDownloadPath } from '@/lib/authed-fetch';
import { saveDocument } from '@/lib/document-actions';
import {
  presentQuoteDocuments,
  type QuoteDocumentSort,
  quoteDocumentCountLabel,
  quoteDocumentMetaLine,
} from '@/lib/quote-documents';
import { useTRPC } from '@/lib/trpc';

const DOCUMENT_SORT_OPTIONS: readonly ListControlOption<QuoteDocumentSort>[] = [
  { label: 'Uploaded newest', value: 'uploaded-newest' },
  { label: 'Uploaded oldest', value: 'uploaded-oldest' },
];

export function QuoteDocumentsTab({
  canUpdate,
  flushAutosave,
  quote,
  quoteNotesField,
}: {
  canUpdate: boolean;
  flushAutosave: () => Promise<boolean>;
  quote: QuoteDetail;
  quoteNotesField: ReactNode;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.documents.listByQuote.queryOptions({ quoteId: quote.id }));
  const router = useRouter();
  const showToast = useAppToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<QuoteDocumentSort>('uploaded-newest');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generationWarnings, setGenerationWarnings] = useState<QuoteDocumentGenerationWarning[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const documents = useMemo(() => presentQuoteDocuments(query.data ?? [], search, sort), [query.data, search, sort]);
  const showGenerate =
    canUpdate && canGenerateQuoteDocument({ kind: quote.kind, product: quote.product, status: quote.status });

  const openDocument = (document: QuoteDocument) => {
    router.push({
      pathname: '/documents/[documentId]',
      params: { documentId: document.id, quoteId: quote.id },
    });
  };

  const downloadDocument = async (document: QuoteDocument) => {
    if (downloadingId) return;

    setDownloadingId(document.id);
    try {
      await saveDocument({
        path: quoteDocumentDownloadPath(quote.id, document.id),
        filename: document.filename,
      });
    } catch (error) {
      showToast('error', error instanceof Error && error.message ? error.message : 'Unable to download document.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <View className="gap-4">
      <Card title="Quote notes">{quoteNotesField}</Card>

      <View className="flex-row flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <View className="min-w-[200px] flex-1">
          <Text className="text-[15px] text-foreground" weight="bold">
            Quote Document
          </Text>
          <Text className="mt-1 text-xs text-muted-foreground">Ready to generate from saved quote details.</Text>
        </View>
        {showGenerate ? (
          <Pressable
            accessibilityRole="button"
            className="flex-row items-center gap-2 rounded-xl border border-border bg-muted px-4 py-3 active:bg-background"
            onPress={() => setGenerateOpen(true)}
          >
            <Icon className="text-primary" icon={IconFilePlus} size={17} />
            <Text className="text-toolbar text-foreground" weight="semibold">
              Generate Quote Document
            </Text>
          </Pressable>
        ) : null}
      </View>

      {generationWarnings.length > 0 ? (
        <View className="gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <Text className="text-sm text-foreground" weight="semibold">
            Quote Document generated with warnings
          </Text>
          {generationWarnings.map((warning) => (
            <Text className="text-xs text-muted-foreground" key={warning.code}>
              {warning.message}
            </Text>
          ))}
        </View>
      ) : null}

      <View className="rounded-2xl border border-border bg-surface p-4">
        <View className="mb-1 flex-row items-center gap-3">
          <ListSearchControl
            accessibilityLabel="Search documents"
            onChangeText={setSearch}
            placeholder="Search documents…"
            tone="background"
            value={search}
          />
          <View className="max-w-[220px] shrink">
            <ListDropdownControl
              accessibilityLabel="Sort documents"
              defaultValue="uploaded-newest"
              dismissLabel="Dismiss document sort"
              icon={IconArrowsSort}
              onChange={setSort}
              options={DOCUMENT_SORT_OPTIONS}
              showLabel
              value={sort}
            />
          </View>
        </View>

        {query.isPending ? (
          <View className="items-center py-8">
            <ActivityIndicator size="small" />
          </View>
        ) : query.isError ? (
          <View className="items-center gap-3 py-8">
            <Text className="text-center text-sm text-muted-foreground">Unable to load Quote Documents.</Text>
            <Pressable
              accessibilityRole="button"
              className="rounded-lg border border-border bg-muted px-3 py-2 active:opacity-80"
              onPress={() => void query.refetch()}
            >
              <Text className="text-xs text-foreground" weight="semibold">
                Try again
              </Text>
            </Pressable>
          </View>
        ) : documents.length === 0 ? (
          <View className="mt-2 rounded-xl border border-dashed border-border px-5 py-7">
            <Text className="text-center text-toolbar text-muted-foreground">
              {search.trim()
                ? 'No documents match your search.'
                : 'No documents yet. Generate the quote document to get started.'}
            </Text>
          </View>
        ) : (
          documents.map((document) => (
            <DocumentRow
              document={document}
              downloading={downloadingId === document.id}
              key={document.id}
              onDownload={() => void downloadDocument(document)}
              onOpen={() => openDocument(document)}
            />
          ))
        )}

        {!query.isPending && !query.isError ? (
          <Text className="mt-3 border-t border-border pt-3 text-[10px] text-muted-foreground" mono>
            {quoteDocumentCountLabel(documents.length)}
          </Text>
        ) : null}
      </View>

      <GenerateQuoteDocumentModal
        flushAutosave={flushAutosave}
        onClose={() => setGenerateOpen(false)}
        onGenerated={setGenerationWarnings}
        open={generateOpen}
        quote={quote}
      />
    </View>
  );
}

function DocumentRow({
  document,
  downloading,
  onDownload,
  onOpen,
}: {
  document: QuoteDocument;
  downloading: boolean;
  onDownload: () => void;
  onOpen: () => void;
}) {
  return (
    <View className="flex-row items-center gap-3 border-t border-border py-3.5">
      <View className="h-10 w-10 items-center justify-center rounded-lg border border-danger/25 bg-danger/10">
        <Text className="text-[9px] text-danger" mono weight="semibold">
          PDF
        </Text>
      </View>
      <Pressable
        accessibilityHint="Opens the document viewer"
        accessibilityLabel={document.filename}
        accessibilityRole="button"
        className="min-w-0 flex-1"
        onPress={onOpen}
      >
        <Text className="text-sm text-foreground" numberOfLines={1} weight="semibold">
          {document.filename}
        </Text>
        <Text className="mt-0.5 text-[10px] text-muted-foreground" mono>
          Rev {document.metadata.revision}
        </Text>
        <Text className="mt-1 text-[10px] text-muted-foreground" mono numberOfLines={1}>
          {quoteDocumentMetaLine(document)}
        </Text>
      </Pressable>
      <DocumentButton icon={IconEye} label="View document" onPress={onOpen} />
      <DocumentButton busy={downloading} icon={IconDownload} label="Download document" onPress={onDownload} />
    </View>
  );
}

function DocumentButton({
  busy = false,
  icon,
  label,
  onPress,
}: {
  busy?: boolean;
  icon: TablerIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled: busy }}
      className="h-9 w-9 items-center justify-center rounded-lg border border-border bg-muted active:opacity-70"
      disabled={busy}
      onPress={onPress}
    >
      {busy ? <ActivityIndicator size="small" /> : <Icon className="text-muted-foreground" icon={icon} size={17} />}
    </Pressable>
  );
}

function Card({ children, title }: { children: ReactNode; title: string }) {
  return (
    <View className="gap-4 rounded-2xl border border-border bg-surface p-4">
      <Text className="text-[10px] uppercase tracking-[1.5px] text-muted-foreground" mono weight="semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}
