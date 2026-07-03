import { departmentLabels, hasPermission } from '@pkg/domain';
import type { QuoteDetail, QuoteDocumentGenerationWarning, UUID } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
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

export type QuoteDocumentActionResult = { warnings: QuoteDocumentGenerationWarning[] };

/**
 * Shared dialog for actions that generate a Quote Document PDF from the saved Quote — currently
 * "Generate Quote Document" and "Draft Email". It owns the lead-time field, bay-availability hints,
 * autosave flush, and warning toasts; callers supply the trigger, copy, and the mutation to run via
 * `onConfirm`.
 */
export function QuoteDocumentActionDialog<R extends QuoteDocumentActionResult>({
  className,
  description,
  errorMessage,
  flushAutosave,
  isPending,
  onConfirm,
  onSuccess,
  quote,
  submitLabel,
  successMessage,
  title,
  trigger,
  unsavedErrorMessage,
}: {
  className?: string | undefined;
  description: string;
  errorMessage: string;
  flushAutosave: () => Promise<boolean>;
  isPending: boolean;
  onConfirm: (input: { leadTime: string; quoteId: UUID }) => Promise<R>;
  onSuccess?: (result: R) => void;
  quote: QuoteDetail;
  submitLabel: string;
  successMessage: (result: R) => string;
  title: string;
  trigger: { ariaLabel: string; icon: ReactNode; label: string };
  unsavedErrorMessage: string;
}) {
  const trpc = useTRPC();
  const { invalidateDocuments } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const defaultLeadTime = getDefaultQuoteDocumentLeadTime(quote);
  const [isOpen, setIsOpen] = useState(false);
  const [leadTime, setLeadTime] = useState(defaultLeadTime);
  const [hasUserEditedLeadTime, setHasUserEditedLeadTime] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canRunStatus = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canRun = canUpdateQuote && canRunStatus;
  const trimmedLeadTime = leadTime.trim();
  const availabilityQuery = useQuery({
    ...trpc.quotes.productBayAvailability.queryOptions({ quoteId: quote.id }),
    enabled: isOpen && quote.productId !== null,
  });
  const availability = availabilityQuery.data;
  const buildTimeDays = availability?.buildTimeDays ?? quote.productBuildTimeDays;

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
  const isBusy = isPending || isSubmitting;

  const handleSubmit = async () => {
    if (isBusy) {
      return;
    }

    setIsSubmitting(true);
    try {
      const didSave = await flushAutosave();
      if (!didSave) {
        toast.error(unsavedErrorMessage);
        return;
      }

      const result = await onConfirm({ leadTime: trimmedLeadTime, quoteId: quote.id });
      await invalidateDocuments();
      toast.success(successMessage(result));
      for (const warning of result.warnings) {
        toast.warning(warning.message);
      }
      onSuccess?.(result);
      setIsOpen(false);
    } catch (error) {
      showMutationError(error, errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger
        render={<Button aria-label={trigger.ariaLabel} className={className} type="button" variant="outline" />}
      >
        {trigger.icon}
        {trigger.label}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="quote-document-action-lead-time">Lead Time</FieldLabel>
          <Input
            disabled={isBusy}
            id="quote-document-action-lead-time"
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
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
