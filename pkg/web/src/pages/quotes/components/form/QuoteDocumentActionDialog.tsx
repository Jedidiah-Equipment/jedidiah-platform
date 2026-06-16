import { departmentLabels, hasPermission } from '@pkg/domain';
import type { QuoteDetail, QuoteDocumentGenerationWarning, UUID } from '@pkg/schema';
import { IconAlertTriangle, IconLoader2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

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
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { getDefaultQuoteDocumentLeadTime, resolveQuoteDocumentLeadTime } from '../types.js';

export type QuoteDocumentActionResult = { warnings: QuoteDocumentGenerationWarning[] };

/**
 * Shared dialog for actions that generate a Quote Document PDF from the saved Quote — currently
 * "Generate Quote Document" and "Draft Email". It owns the lead-time field, bay-availability hints,
 * brochure-missing acknowledgement, autosave flush, and warning toasts; callers supply the trigger,
 * copy, and the mutation to run via `onConfirm`.
 */
export function QuoteDocumentActionDialog<R extends QuoteDocumentActionResult>({
  className,
  confirmWithoutBrochureLabel,
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
  confirmWithoutBrochureLabel: string;
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
  const [confirmMissingBrochure, setConfirmMissingBrochure] = useState(false);
  const canRunStatus = quote.status === 'draft' || quote.status === 'sent' || quote.status === 'accepted';
  const canUpdateQuote = hasPermission(accessQuery.data, 'quote:update');
  const canRun = canUpdateQuote && canRunStatus;
  const trimmedLeadTime = leadTime.trim();
  const brochureQuery = useQuery(trpc.quotes.getProductBrochure.queryOptions({ quoteId: quote.id }));
  const availabilityQuery = useQuery({
    ...trpc.quotes.productBayAvailability.queryOptions({ quoteId: quote.id }),
    enabled: isOpen,
  });
  const availability = availabilityQuery.data;
  const isMissingBrochure = brochureQuery.isSuccess && !brochureQuery.data;

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

  if (!canRun) {
    return null;
  }

  const handleSubmit = async () => {
    const didSave = await flushAutosave();
    if (!didSave) {
      toast.error(unsavedErrorMessage);
      return;
    }

    // Server generation can omit the brochure, but sales must acknowledge that path explicitly.
    if (isMissingBrochure && !confirmMissingBrochure) {
      setConfirmMissingBrochure(true);
      return;
    }

    try {
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
            disabled={isPending}
            id="quote-document-action-lead-time"
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
          <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={isPending || brochureQuery.isLoading || trimmedLeadTime.length === 0}
            onClick={handleSubmit}
            type="button"
          >
            {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            {confirmMissingBrochure ? confirmWithoutBrochureLabel : submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
