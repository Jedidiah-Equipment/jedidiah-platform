import { formatCurrency, formatDate } from '@pkg/domain';
import type { InvoiceNumber } from '@pkg/schema';
import type { JobSummary } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { StampInvoiceNumberDialog } from '@/components/form/StampInvoiceNumberDialog.js';
import { getApiErrorAppCode } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { useJobWrite } from '../jobs/use-job-write.js';

export type StampableJob = Pick<JobSummary, 'id' | 'jobNumber' | 'customerName' | 'farmName' | 'pricedAt'> & {
  pricedTotal: number;
};

export function StampInvoiceDialog({
  job,
  open,
  onOpenChange,
}: {
  job: StampableJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const stamp = useMutation(
    trpc.contractingJobs.invoicing.stamp.mutationOptions({
      onError: async (error) => {
        write.report(error);
        if (getApiErrorAppCode(error) !== 'contracting_job.total_changed') return;
        toast.error('This Job was re-priced — review the new total');
        onOpenChange(false);
        await write.invalidate();
      },
    }),
  );
  const description = [
    job.customerName,
    job.farmName,
    `Total ex VAT ${formatCurrency(job.pricedTotal)}`,
    job.pricedAt ? `Priced ${formatDate(job.pricedAt)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <StampInvoiceNumberDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Stamp invoice number · ${job.jobNumber}`}
      description={description}
      submitLabel="Stamp"
      submit={(invoiceNumber) => stamp.mutateAsync({ id: job.id, invoiceNumber, expectedTotal: job.pricedTotal })}
      onStamped={async () => {
        toast.success('Invoiced');
        await write.invalidate();
      }}
      renderAlsoOn={(invoiceNumber) => <JobsAlsoOn invoiceNumber={invoiceNumber} />}
    >
      <p className="text-muted-foreground text-sm">After stamping, nothing on this Job can change.</p>
      {getApiErrorAppCode(stamp.error) === 'contracting_job.total_changed' ? null : (
        <ErrorMessage error={stamp.error} fallbackMessage="Unable to stamp the invoice number." />
      )}
    </StampInvoiceNumberDialog>
  );
}

function JobsAlsoOn({ invoiceNumber }: { invoiceNumber: InvoiceNumber }) {
  const trpc = useTRPC();
  const matches = useQuery(trpc.contractingJobs.invoicing.byNumber.queryOptions({ invoiceNumber }));
  if (!matches.data?.length) return null;
  return (
    <p className="text-sm">Also on {matches.data.map((job) => `${job.jobNumber} (${job.customerName})`).join(', ')}.</p>
  );
}
