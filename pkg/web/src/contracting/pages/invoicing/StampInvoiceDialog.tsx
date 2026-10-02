import { useDebouncedValue } from '@mantine/hooks';
import { formatCurrency, formatDate } from '@pkg/domain';
import { InvoiceNumber, type JobSummary } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { getApiErrorAppCode } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { useJobWrite } from '../jobs/use-job-write.js';

export type StampableJob = Pick<JobSummary, 'id' | 'jobNumber' | 'customerName' | 'farmName' | 'pricedAt'> & {
  pricedTotal: number;
};

const StampInvoiceValues = z.object({ invoiceNumber: InvoiceNumber });

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
        await write.invalidateJobs();
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
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Stamp invoice number · ${job.jobNumber}`}
      description={description}
      submitLabel="Stamp"
      defaultValues={{ invoiceNumber: '' }}
      validator={StampInvoiceValues}
      onCreate={(values) =>
        stamp.mutateAsync({ id: job.id, invoiceNumber: values.invoiceNumber, expectedTotal: job.pricedTotal })
      }
      onCreated={async () => {
        onOpenChange(false);
        toast.success('Invoiced');
        await write.invalidateJobs();
      }}
    >
      {(form) => (
        <>
          <form.AppField name="invoiceNumber">
            {(field) => <field.TextField label="Invoice number" autoFocus className="font-mono" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.invoiceNumber}>
            {(invoiceNumber) => <SharedInvoiceNumberNotice invoiceNumber={invoiceNumber} />}
          </form.Subscribe>
          <p className="text-muted-foreground text-sm">After stamping, nothing on this Job can change.</p>
          {getApiErrorAppCode(stamp.error) === 'contracting_job.total_changed' ? null : (
            <ErrorMessage error={stamp.error} fallbackMessage="Unable to stamp the invoice number." />
          )}
        </>
      )}
    </CreateEntityDialog>
  );
}

/** One accounting invoice may cover several Jobs, so a reused number is shown, never refused. */
function SharedInvoiceNumberNotice({ invoiceNumber }: { invoiceNumber: string }) {
  const trpc = useTRPC();
  const [debounced] = useDebouncedValue(invoiceNumber.trim(), 300);
  const valid = InvoiceNumber.safeParse(debounced).success;
  const matches = useQuery(
    trpc.contractingJobs.invoicing.byNumber.queryOptions({ invoiceNumber: debounced }, { enabled: valid }),
  );
  if (!valid || !matches.data?.length) return null;
  return (
    <p className="text-sm">Also on {matches.data.map((job) => `${job.jobNumber} (${job.customerName})`).join(', ')}.</p>
  );
}
