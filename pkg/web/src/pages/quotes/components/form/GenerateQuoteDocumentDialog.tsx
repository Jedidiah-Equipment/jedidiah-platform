import { departmentLabels, hasPermission } from '@pkg/domain';
import type { QuoteDetail, QuoteDocumentGenerationWarning } from '@pkg/schema';
import { IconFilePlus, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { getDefaultQuoteDocumentLeadTime, resolveQuoteDocumentLeadTime } from '../types.js';

export function GenerateQuoteDocumentDialog({
  flushAutosave,
  onGenerated,
  quote,
}: {
  flushAutosave: () => Promise<boolean>;
  onGenerated: (warnings: QuoteDocumentGenerationWarning[]) => void;
  quote: QuoteDetail;
}) {
  const trpc = useTRPC();
  const generateMutation = useMutation(trpc.quotes.generateDocument.mutationOptions());
  const { invalidateDocuments } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const defaultLeadTime = getDefaultQuoteDocumentLeadTime(quote);
  const [isOpen, setIsOpen] = useState(false);
  const [leadTime, setLeadTime] = useState(defaultLeadTime);
  const [hasUserEditedLeadTime, setHasUserEditedLeadTime] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canRunStatus = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
  const isCustomQuote = quote.kind === 'custom';
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const hasResolvedProductDocumentFacts = quote.product !== null;
  const canRun = canUpdateQuote && canRunStatus && (isCustomQuote || hasResolvedProductDocumentFacts);
  const trimmedLeadTime = leadTime.trim();
  const availabilityQuery = useQuery({
    ...trpc.quotes.productBayAvailability.queryOptions({ quoteId: quote.id }),
    enabled: isOpen && !isCustomQuote && hasResolvedProductDocumentFacts,
  });
  const availability = availabilityQuery.data;
  const buildTimeDays = isCustomQuote ? null : (availability?.buildTimeDays ?? quote.product?.buildTimeDays ?? null);

  useEffect(() => {
    if (isOpen) {
      setLeadTime(defaultLeadTime);
      setHasUserEditedLeadTime(false);
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

  if (!canRun) {
    return null;
  }

  // `isPending` only covers the mutation; the autosave flush happens before it, so track our own busy
  // flag to keep the submit button disabled across the whole flow and prevent double submits.
  const isBusy = generateMutation.isPending || isSubmitting;

  const handleSubmit = async () => {
    if (isBusy) {
      return;
    }

    setIsSubmitting(true);
    try {
      const didSave = await flushAutosave();
      if (!didSave) {
        toast.error('Fix the highlighted quote fields before generating the Quote Document.');
        return;
      }

      const result = await generateMutation.mutateAsync({ leadTime: trimmedLeadTime, quoteId: quote.id });
      await invalidateDocuments();
      toast.success('Quote Document generated');
      for (const warning of result.warnings) {
        toast.warning(warning.message);
      }
      onGenerated(result.warnings);
      setIsOpen(false);
    } catch (error) {
      showMutationError(error, 'Unable to generate Quote Document.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
          <DialogDescription>Create a saved PDF revision from the current saved Quote.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="generate-quote-document-lead-time">Lead Time</FieldLabel>
          <Input
            disabled={isBusy}
            id="generate-quote-document-lead-time"
            onChange={(event) => {
              setHasUserEditedLeadTime(true);
              setLeadTime(event.target.value);
            }}
            value={leadTime}
          />
        </Field>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Build time</span>
            <span className="font-medium">{buildTimeDays === null ? '—' : `${buildTimeDays} working days`}</span>
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
        <DialogFooter>
          <DialogClose render={<Button disabled={isBusy} type="button" variant="outline" />}>Cancel</DialogClose>
          <Button disabled={isBusy || trimmedLeadTime.length === 0} onClick={handleSubmit} type="button">
            {isBusy ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
