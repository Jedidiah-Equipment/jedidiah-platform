import { departmentLabels, hasPermission } from '@pkg/domain';
import type { QuoteDetail, QuoteDocument, QuoteDocumentGenerationWarning } from '@pkg/schema';
import { IconAlertTriangle, IconFilePlus, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent } from '@/components/ui/card.js';
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
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

import { getDefaultQuoteDocumentLeadTime, resolveQuoteDocumentLeadTime } from '../types.js';

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
            <span className="text-muted-foreground">
              {hasUnsavedChanges
                ? 'Waiting for autosave before a new document can be generated.'
                : 'Ready to generate from saved Quote details.'}
            </span>
          </div>
          <GenerateQuoteDocumentDialog hasUnsavedChanges={hasUnsavedChanges} onGenerated={onGenerated} quote={quote} />
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
  const { invalidateDocuments } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const defaultLeadTime = getDefaultQuoteDocumentLeadTime(quote);
  const [isOpen, setIsOpen] = useState(false);
  const [leadTime, setLeadTime] = useState(defaultLeadTime);
  const [hasUserEditedLeadTime, setHasUserEditedLeadTime] = useState(false);
  const [confirmMissingBrochure, setConfirmMissingBrochure] = useState(false);
  const canGenerateStatus = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canGenerate = canUpdateQuote && canGenerateStatus;
  const trimmedLeadTime = leadTime.trim();
  const brochureQuery = useQuery(trpc.quotes.getProductBrochure.queryOptions({ quoteId: quote.id }));
  const availabilityQuery = useQuery({
    ...trpc.quotes.productBayAvailability.queryOptions({ productId: quote.productId }),
    enabled: isOpen,
  });
  const availability = availabilityQuery.data;
  const isMissingBrochure = brochureQuery.isSuccess && !brochureQuery.data;
  const generateMutation = useMutation(
    trpc.quotes.generateDocument.mutationOptions({
      onSuccess: async (result) => {
        await invalidateDocuments();
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
      setHasUserEditedLeadTime(false);
      setConfirmMissingBrochure(false);
    }
  }, [defaultLeadTime, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Availability can arrive after the user starts typing; only sync while the field is untouched.
    setLeadTime((currentLeadTime) =>
      resolveQuoteDocumentLeadTime({
        availability,
        fallbackLeadTime: defaultLeadTime,
        hasUserEditedLeadTime,
        leadTime: currentLeadTime,
      }),
    );
  }, [availability, defaultLeadTime, hasUserEditedLeadTime, isOpen]);

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
        <IconFilePlus data-icon="inline-start" />
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
            onChange={(event) => {
              setHasUserEditedLeadTime(true);
              setLeadTime(event.target.value);
              setConfirmMissingBrochure(false);
            }}
            value={leadTime}
          />
        </Field>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Build time</span>
            <span className="font-medium">
              {availability?.buildTimeDays ?? quote.productBuildTimeDays} working days
            </span>
          </div>
          {availability?.bays.length ? (
            <div className="grid gap-1">
              <span className="text-muted-foreground">Next available bay times</span>
              <div className="grid gap-1">
                {availability.bays.map((bay) => (
                  <div className="flex items-center justify-between gap-3" key={bay.bayId}>
                    <span className="min-w-0 truncate">
                      {bay.name}
                      <span className="text-muted-foreground"> / {departmentLabels[bay.department]}</span>
                    </span>
                    <span className="shrink-0 font-medium">{bay.waitWorkingDays} working days</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {availabilityQuery.isLoading ? (
            <span className="text-muted-foreground">Loading bay availability...</span>
          ) : null}
        </div>
        {confirmMissingBrochure ? (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>No Product brochure attached</AlertTitle>
            <AlertDescription>
              This Quote Document will be generated without a Product brochure. Proceed only if that is intentional.
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button disabled={generateMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={
              generateMutation.isPending || brochureQuery.isLoading || hasUnsavedChanges || trimmedLeadTime.length === 0
            }
            onClick={() => {
              // Server generation can omit the brochure, but sales must acknowledge that path explicitly.
              if (isMissingBrochure && !confirmMissingBrochure) {
                setConfirmMissingBrochure(true);
                return;
              }

              generateMutation.mutate({
                leadTime: trimmedLeadTime,
                quoteId: quote.id,
              });
            }}
            type="button"
          >
            {generateMutation.isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
            {confirmMissingBrochure ? 'Proceed without brochure' : 'Generate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
