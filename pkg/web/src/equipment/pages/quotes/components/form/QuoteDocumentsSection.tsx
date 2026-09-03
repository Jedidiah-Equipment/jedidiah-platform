import type { QuoteDetail, QuoteDocument, QuoteDocumentGenerationWarning } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

import { GenerateQuoteDocumentDialog } from './GenerateQuoteDocumentDialog.js';

type QuoteDocumentsSectionProps = {
  flushAutosave: () => Promise<boolean>;
  generationWarnings: QuoteDocumentGenerationWarning[];
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  quote: QuoteDetail;
};

export function QuoteDocumentsSection({
  flushAutosave,
  generationWarnings,
  onGenerated,
  quote,
}: QuoteDocumentsSectionProps) {
  const trpc = useTRPC();
  const documentsQuery = useQuery(trpc.documents.listByQuote.queryOptions({ quoteId: quote.id }));
  const quoteDocumentMetadata = useMemo(
    () => ({
      getSearchText: (document: QuoteDocument) => `Rev ${document.metadata.revision}`,
      render: (document: QuoteDocument) => `Rev ${document.metadata.revision}`,
    }),
    [],
  );

  return (
    <>
      <Card size="sm">
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1 text-sm">
            <span className="font-medium">Quote Document</span>
            <span className="text-muted-foreground">Ready to generate from saved Quote details.</span>
          </div>
          <GenerateQuoteDocumentDialog flushAutosave={flushAutosave} onGenerated={onGenerated} quote={quote} />
        </CardContent>
      </Card>
      {generationWarnings.length > 0 ? (
        <Alert>
          <IconAlertTriangle />
          <AlertTitle>Quote Document generated with warnings</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {generationWarnings.map((warning) => (
                <li key={warning.code}>{warning.message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <DocumentCardList
        defaultSort="createdAtDesc"
        documents={documentsQuery.data ?? []}
        emptyMessage="No Quote Documents captured."
        errorMessage={getApiQueryErrorMessage(documentsQuery.error, 'Unable to load Quote Documents.') ?? null}
        isLoading={documentsQuery.isLoading}
        metadata={quoteDocumentMetadata}
        owner={{ id: quote.id, type: 'quote' }}
      />
    </>
  );
}
