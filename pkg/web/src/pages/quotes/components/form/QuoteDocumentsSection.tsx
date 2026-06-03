import { formatBytes, formatDate, hasPermission } from '@pkg/domain';
import type { QuoteDetail, QuoteDocument, QuoteDocumentGenerationWarning } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DownloadIcon, EyeIcon, FilePlus2Icon, FileTextIcon, Loader2Icon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DocumentPreviewSheet } from '@/components/documents/DocumentPreviewSheet.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { downloadQuoteDocument } from '@/utils/document.js';

import { getDefaultQuoteDocumentLeadTime } from '../types.js';

type QuoteDocumentsSectionProps = {
  generationWarnings: QuoteDocumentGenerationWarning[];
  hasUnsavedChanges: boolean;
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  quote: QuoteDetail;
};

export function QuoteDocumentsSection({
  generationWarnings,
  hasUnsavedChanges,
  onGenerated,
  quote,
}: QuoteDocumentsSectionProps) {
  const trpc = useTRPC();
  const documentsQuery = useQuery(trpc.documents.listByQuote.queryOptions({ quoteId: quote.id }));
  const [previewDocument, setPreviewDocument] = useState<QuoteDocument | null>(null);
  const documents = documentsQuery.data ?? [];

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1 text-sm">
          <span className="font-medium">Quote Document</span>
          <span className="text-muted-foreground">
            {hasUnsavedChanges
              ? 'Waiting for autosave before a new document can be generated.'
              : 'Ready to generate from saved Quote details.'}
          </span>
        </div>
        <GenerateQuoteDocumentDialog hasUnsavedChanges={hasUnsavedChanges} onGenerated={onGenerated} quote={quote} />
      </div>
      {generationWarnings.length > 0 ? (
        <Alert>
          <TriangleAlertIcon />
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
      <div className="overflow-hidden rounded-lg border">
        {documents.length > 0 ? (
          <div className="divide-y">
            {documents.map((document) => (
              <div
                className="grid gap-3 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_7rem_7rem_9rem_11rem] md:items-center"
                key={document.id}
              >
                <div className="flex min-w-0 items-center gap-2 font-medium">
                  <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{document.filename}</span>
                </div>
                <div className="text-muted-foreground">Rev {document.metadata.revision}</div>
                <div className="text-muted-foreground">{formatBytes(document.byteSize)}</div>
                <div className="text-muted-foreground">{formatDate(document.createdAt, 'medium')}</div>
                <div className="flex justify-end gap-2">
                  <PreviewQuoteDocumentButton document={document} onPreviewDocument={setPreviewDocument} />
                  <DownloadQuoteDocumentButton document={document} quoteId={quote.id} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="bg-muted/30 p-3 text-muted-foreground text-sm">
            {documentsQuery.isLoading ? 'Loading documents...' : 'No Quote Documents captured.'}
          </p>
        )}
      </div>
      <DocumentPreviewSheet
        document={previewDocument}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewDocument(null);
          }
        }}
        open={Boolean(previewDocument)}
        owner={{ id: quote.id, type: 'quote' }}
      />
    </>
  );
}

function GenerateQuoteDocumentDialog({
  hasUnsavedChanges,
  onGenerated,
  quote,
}: {
  hasUnsavedChanges: boolean;
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  quote: QuoteDetail;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const defaultLeadTime = getDefaultQuoteDocumentLeadTime(quote);
  const [isOpen, setIsOpen] = useState(false);
  const [leadTime, setLeadTime] = useState(defaultLeadTime);
  const canGenerateStatus = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canGenerate = canUpdateQuote && canGenerateStatus;
  const trimmedLeadTime = leadTime.trim();
  const generateMutation = useMutation(
    trpc.quotes.generateDocument.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() });
        onGenerated(result.warnings);
        toast.success('Quote Document generated');
        for (const warning of result.warnings) {
          toast.warning(warning.message);
        }
        setIsOpen(false);
      },
      onError: (error) => showMutationError(error, 'Unable to generate Quote Document.'),
    }),
  );

  useEffect(() => {
    if (isOpen) {
      setLeadTime(defaultLeadTime);
    }
  }, [defaultLeadTime, isOpen]);

  if (!canGenerate) {
    return null;
  }

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={
          <Button aria-label={`Generate Quote Document for quote ${quote.code}`} type="button" variant="outline" />
        }
      >
        <FilePlus2Icon data-icon="inline-start" />
        Generate Quote Document
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate Quote Document</DialogTitle>
          <DialogDescription>
            {hasUnsavedChanges
              ? 'Wait for this Quote to finish saving before generating a Quote Document.'
              : 'Create a saved PDF revision from the current saved Quote.'}
          </DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="quote-document-lead-time">Lead Time</FieldLabel>
          <Input
            disabled={generateMutation.isPending || hasUnsavedChanges}
            id="quote-document-lead-time"
            onChange={(event) => setLeadTime(event.target.value)}
            value={leadTime}
          />
        </Field>
        <DialogFooter>
          <DialogClose render={<Button disabled={generateMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={generateMutation.isPending || hasUnsavedChanges || trimmedLeadTime.length === 0}
            onClick={() =>
              generateMutation.mutate({
                leadTime: trimmedLeadTime,
                quoteId: quote.id,
              })
            }
            type="button"
          >
            {generateMutation.isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewQuoteDocumentButton({
  document,
  onPreviewDocument,
}: {
  document: QuoteDocument;
  onPreviewDocument: (document: QuoteDocument) => void;
}) {
  return (
    <Button
      aria-label={`View ${document.filename}`}
      size="sm"
      type="button"
      variant="ghost"
      onClick={() => onPreviewDocument(document)}
    >
      <EyeIcon data-icon="inline-start" />
      View
    </Button>
  );
}

function DownloadQuoteDocumentButton({ document, quoteId }: { document: QuoteDocument; quoteId: QuoteDetail['id'] }) {
  const showMutationError = useApiMutationErrorToast();
  const downloadMutation = useMutation({
    mutationFn: () => downloadQuoteDocument(quoteId, document),
    onError: (error) => {
      showMutationError(error, 'Unable to download document.');
    },
  });

  return (
    <Button
      aria-label={`Download ${document.filename}`}
      disabled={downloadMutation.isPending}
      size="sm"
      type="button"
      variant="ghost"
      onClick={() => void downloadMutation.mutateAsync()}
    >
      {downloadMutation.isPending ? (
        <Loader2Icon data-icon="inline-start" className="animate-spin" />
      ) : (
        <DownloadIcon data-icon="inline-start" />
      )}
      Download
    </Button>
  );
}
