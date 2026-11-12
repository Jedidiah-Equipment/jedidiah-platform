import { formatCurrency } from '@pkg/domain';
import type { InvoiceNumber, UUID } from '@pkg/schema';
import type { QuoteSummary } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { StampInvoiceNumberDialog } from '@/components/form/StampInvoiceNumberDialog.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

/** The fields of a Quote list row the dialog needs, so the Quote page and the Invoicing page both open it. */
export type StampableQuote = Pick<QuoteSummary, 'id' | 'code' | 'customerCompanyName' | 'invoiceNumber'> & {
  totalExVat: number;
};

/** Enters a Quote's Invoice Number, or corrects the one it already carries. */
export function QuoteStampInvoiceDialog({
  quote,
  open,
  onOpenChange,
}: {
  quote: StampableQuote;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const { invalidateQuotes } = useQueryInvalidation();
  const correcting = quote.invoiceNumber !== null;
  const stamp = useMutation(trpc.quotes.stampInvoice.mutationOptions());
  const correct = useMutation(trpc.quotes.correctInvoiceNumber.mutationOptions());
  const write = correcting ? correct : stamp;
  return (
    <StampInvoiceNumberDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${correcting ? 'Correct the Invoice Number' : 'Enter the Invoice Number'} · ${quote.code}`}
      description={`${quote.customerCompanyName} · Total ex VAT ${formatCurrency(quote.totalExVat)}`}
      submitLabel={correcting ? 'Correct' : 'Invoice'}
      defaultInvoiceNumber={quote.invoiceNumber ?? ''}
      submit={(invoiceNumber) => write.mutateAsync({ id: quote.id, invoiceNumber })}
      onStamped={async () => {
        toast.success(correcting ? 'Invoice Number corrected' : 'Invoiced');
        await invalidateQuotes();
      }}
      renderAlsoOn={(invoiceNumber) => <QuotesAlsoOn invoiceNumber={invoiceNumber} quoteId={quote.id} />}
    >
      <ErrorMessage error={write.error} fallbackMessage="Unable to save the Invoice Number." />
    </StampInvoiceNumberDialog>
  );
}

function QuotesAlsoOn({ invoiceNumber, quoteId }: { invoiceNumber: InvoiceNumber; quoteId: UUID }) {
  const trpc = useTRPC();
  const matches = useQuery(trpc.quotes.findByInvoiceNumber.queryOptions({ invoiceNumber }));
  const others = matches.data?.filter((match) => match.id !== quoteId) ?? [];
  if (others.length === 0) return null;
  return (
    <p className="text-sm">
      Also on {others.map((match) => `${match.code} (${match.customerCompanyName})`).join(', ')}.
    </p>
  );
}
