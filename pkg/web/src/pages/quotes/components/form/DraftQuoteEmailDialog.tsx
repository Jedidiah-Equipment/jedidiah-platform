import type { QuoteDetail, QuoteDraftEmailResult } from '@pkg/schema';
import { IconMail } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';

import { useTRPC } from '@/lib/trpc.js';

import { QuoteDocumentActionDialog } from './QuoteDocumentActionDialog.js';

/**
 * Drafts a customer-style quote email (AI body + PDF) and sends it to the logged-in user's own inbox,
 * reusing the shared Quote Document action dialog for the lead-time/brochure/availability UX.
 */
export function DraftQuoteEmailDialog({
  className,
  flushAutosave,
  quote,
}: {
  className?: string;
  flushAutosave: () => Promise<boolean>;
  quote: QuoteDetail;
}) {
  const trpc = useTRPC();
  const draftMutation = useMutation(trpc.quotes.draftEmail.mutationOptions());

  return (
    <QuoteDocumentActionDialog<QuoteDraftEmailResult>
      className={className}
      confirmWithoutBrochureLabel="Draft without brochure"
      description="Generate the email copy and a Quote Document PDF, then send them to your own inbox to review before forwarding to the customer."
      errorMessage="Unable to draft the quote email."
      flushAutosave={flushAutosave}
      isPending={draftMutation.isPending}
      onConfirm={(input) => draftMutation.mutateAsync(input)}
      quote={quote}
      submitLabel="Draft & send"
      successMessage={(result) => `Draft emailed to ${result.recipientEmail}`}
      title="Draft Email"
      trigger={{
        ariaLabel: `Draft email for quote ${quote.code}`,
        icon: <IconMail data-icon="inline-start" />,
        label: 'Draft Email',
      }}
      unsavedErrorMessage="Fix the highlighted quote fields before drafting the email."
    />
  );
}
