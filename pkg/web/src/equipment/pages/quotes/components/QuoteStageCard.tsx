import { actionSheet, formatDate, getFirstName } from '@pkg/domain';
import { pricePersistedQuote } from '@pkg/domain/equipment';
import { type QuoteDetail, QuoteSentBackNote, type QuoteStage } from '@pkg/schema/equipment';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { RemoveEntityDialog } from '@/components/common/RemoveEntityButton.js';
import { ReasonDialog } from '@/components/form/ReasonDialog.js';
import { HelpLink } from '@/components/help/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { QuoteStageBadge } from './QuoteStageBadge.js';
import { QuoteStampInvoiceDialog } from './QuoteStampInvoiceDialog.js';

const stageSentences: Partial<Record<QuoteStage, string>> = {
  accepted: 'Sold, with its work still under way. It can be sent for approval before the work finishes.',
  'awaiting-pricing': 'The work is finished. An Administrator completes the quote and sends it for approval.',
  'awaiting-approval': 'A Super Administrator reviews it, then approves it or sends it back with a note.',
  'awaiting-invoice': 'Approved and frozen. An Administrator enters the Invoice Number.',
  invoiced: 'The Invoice Number is recorded. Only the notes and delivery dates still change.',
};

type Confirming = 'sendForApproval' | 'removeInvoiceNumber' | null;

/** Where a sold Quote stands on the way to its invoice, and the Quote Actions this person may take from here. */
export function QuoteStageCard({
  flushAutosave,
  quote,
}: {
  /** A Quote Action restarts the form from the new status, so pending edits save first or the action waits. */
  flushAutosave: () => Promise<boolean>;
  quote: QuoteDetail;
}) {
  const trpc = useTRPC();
  const { invalidateQuotes } = useQueryInvalidation();
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [sendingBack, setSendingBack] = useState(false);
  const [stamping, setStamping] = useState(false);
  const [saving, setSaving] = useState(false);
  const showMutationError = useApiMutationErrorToast();
  const mutationHandlers = {
    onError: (error: unknown) => showMutationError(error, 'Unable to move the quote.'),
    onSuccess: async () => {
      setConfirming(null);
      await invalidateQuotes();
    },
  };
  const sendForApproval = useMutation(trpc.quotes.sendForApproval.mutationOptions(mutationHandlers));
  const approve = useMutation(trpc.quotes.approve.mutationOptions(mutationHandlers));
  const sendBack = useMutation(trpc.quotes.sendBack.mutationOptions({ onSuccess: () => invalidateQuotes() }));
  const removeInvoiceNumber = useMutation(trpc.quotes.removeInvoiceNumber.mutationOptions(mutationHandlers));
  const sentence = stageSentences[quote.stage];
  if (!sentence) return null;

  const sheet = actionSheet(quote.actions);
  const sendBlocked = sheet.verdict('sendForApproval');
  const sendForApprovalAction = sheet.action('sendForApproval');
  const approveAction = sheet.action('approve');
  const stampAction = sheet.action('stampInvoice');
  const correctAction = sheet.action('correctInvoiceNumber');
  const sendBackAction = sheet.action('sendBack');
  const removeAction = sheet.action('removeInvoiceNumber');
  const busy = saving || sendForApproval.isPending || approve.isPending || removeInvoiceNumber.isPending;
  const afterSaving = (run: () => void) => ({
    onClick: async () => {
      setSaving(true);
      try {
        if (await flushAutosave()) run();
        else toast.error('Fix the highlighted quote fields before moving the quote.');
      } finally {
        setSaving(false);
      }
    },
    // A field blurred on mousedown flushes and can raise the autosave banner, which moves this button before the
    // click lands. The click flushes anyway, so the field keeps focus until then.
    onMouseDown: (event: React.MouseEvent) => event.preventDefault(),
  });

  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>Stage</CardDescription>
        <CardTitle>
          <QuoteStageBadge stage={quote.stage} />
        </CardTitle>
        <CardAction>
          <HelpLink label="How to take a finished sale to its invoice" topic="equipmentInvoicing" />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground">{sentence}</p>
        {quote.sentBackNote ? (
          <Alert>
            <IconArrowBackUp />
            <AlertTitle>
              Sent back{quote.sentBackByName ? ` by ${getFirstName(quote.sentBackByName)}` : ''}
              {quote.sentBackAt ? ` on ${formatDate(quote.sentBackAt)}` : ''}
            </AlertTitle>
            <AlertDescription className="whitespace-pre-wrap">{quote.sentBackNote}</AlertDescription>
          </Alert>
        ) : null}
        {quote.invoiceNumber ? (
          <div className="grid gap-0.5">
            <span className="font-mono font-semibold">{quote.invoiceNumber}</span>
            <span className="text-xs text-muted-foreground">
              Invoiced{quote.invoicedAt ? ` ${formatDate(quote.invoicedAt)}` : ''}
              {quote.invoicedByName ? ` by ${getFirstName(quote.invoicedByName)}` : ''}
            </span>
          </div>
        ) : null}
        {!sendBlocked.allowed && sendBlocked.reason === 'delivery-unconfirmed' ? (
          <p className="text-sm text-warning-foreground">{sendBlocked.message}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {sendForApprovalAction ? (
            <Button
              {...sendForApprovalAction}
              disabled={busy || sendForApprovalAction.disabled}
              {...afterSaving(() => setConfirming('sendForApproval'))}
              type="button"
            >
              Send for approval
            </Button>
          ) : null}
          {approveAction ? (
            <Button
              {...approveAction}
              disabled={busy || approveAction.disabled}
              {...afterSaving(() => approve.mutate({ id: quote.id }))}
              type="button"
            >
              Approve
            </Button>
          ) : null}
          {stampAction ? (
            <Button
              {...stampAction}
              disabled={busy || stampAction.disabled}
              {...afterSaving(() => setStamping(true))}
              type="button"
            >
              Enter Invoice Number
            </Button>
          ) : null}
          {correctAction ? (
            <Button
              {...correctAction}
              disabled={busy || correctAction.disabled}
              {...afterSaving(() => setStamping(true))}
              type="button"
              variant="outline"
            >
              Correct
            </Button>
          ) : null}
          {sendBackAction ? (
            <Button
              {...sendBackAction}
              disabled={busy || sendBackAction.disabled}
              {...afterSaving(() => setSendingBack(true))}
              type="button"
              variant="outline"
            >
              Send back
            </Button>
          ) : null}
          {removeAction ? (
            <Button
              {...removeAction}
              disabled={busy || removeAction.disabled}
              {...afterSaving(() => setConfirming('removeInvoiceNumber'))}
              type="button"
              variant="destructive"
            >
              Remove
            </Button>
          ) : null}
        </div>
      </CardContent>
      <Dialog
        onOpenChange={(open) => setConfirming(open ? 'sendForApproval' : null)}
        open={confirming === 'sendForApproval'}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {quote.code} for approval?</DialogTitle>
            <DialogDescription>
              A Super Administrator reviews it next. Nobody else can change it while it waits.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button disabled={busy} type="button" variant="outline" />}>Cancel</DialogClose>
            <Button disabled={busy} onClick={() => sendForApproval.mutate({ id: quote.id })} type="button">
              Send for approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RemoveEntityDialog
        description="The quote goes back to Awaiting invoice, and can be cancelled once it carries no Invoice Number."
        isPending={removeInvoiceNumber.isPending}
        onConfirm={() => removeInvoiceNumber.mutate({ id: quote.id })}
        onOpenChange={(open) => setConfirming(open ? 'removeInvoiceNumber' : null)}
        open={confirming === 'removeInvoiceNumber'}
        title={`Remove the Invoice Number from ${quote.code}?`}
      />
      <ReasonDialog
        description="The quote returns to Awaiting pricing and carries your note until it is sent again."
        error={sendBack.error}
        fallbackMessage="Unable to send the quote back."
        label="What needs to change"
        onOpenChange={setSendingBack}
        open={sendingBack}
        schema={QuoteSentBackNote}
        submit={(note) => sendBack.mutateAsync({ id: quote.id, note })}
        submitLabel="Send back"
        title={`Send ${quote.code} back`}
      />
      {stamping ? (
        <QuoteStampInvoiceDialog
          onOpenChange={setStamping}
          open
          quote={{
            code: quote.code,
            customerCompanyName: quote.customerCompanyName,
            id: quote.id,
            invoiceNumber: quote.invoiceNumber,
            totalExVat: pricePersistedQuote(quote).subtotal,
          }}
        />
      ) : null}
    </Card>
  );
}
