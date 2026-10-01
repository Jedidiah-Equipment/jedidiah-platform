import type { Customer } from '@pkg/schema/equipment';
import { IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { HelpLink } from '@/components/help/index.js';
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
import { useCustomerOptions } from '@/equipment/hooks/options/use-customer-options.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatCustomerMergeConfirmation, getCustomerMergeOptions } from './customer-merge.js';

export const MergeCustomerDialog: React.FC<{ customer: Customer }> = ({ customer }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateAudit, invalidateQuotes, invalidateProductUnits, invalidateJobs, invalidateCustomers } =
    useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const customers = useCustomerOptions({ enabled: open, limit: 0 });
  const options = useMemo(() => getCustomerMergeOptions(customers.items, customer.id), [customer.id, customers.items]);
  const target = customers.items.find((candidate) => candidate.id === targetId) ?? null;
  const preview = useQuery(
    trpc.customers.mergePreview.queryOptions(
      { sourceId: customer.id },
      { enabled: open && confirming && target !== null },
    ),
  );
  const mergeMutation = useMutation(
    trpc.customers.merge.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to merge customers.'),
    }),
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setTargetId('');
      setConfirming(false);
    }
  };

  const confirmMerge = async () => {
    if (!target) return;
    let merged: Customer;
    try {
      merged = await mergeMutation.mutateAsync({ sourceId: customer.id, targetId: target.id });
    } catch {
      return;
    }
    handleOpenChange(false);
    toast.success(`${customer.companyName} merged into ${merged.companyName}`);
    // Leave the deleted Customer before refreshing its still-mounted detail and preview queries.
    await navigate({ to: '/equipment/customers/$id/edit', params: { id: merged.id } });
    await Promise.all([
      invalidateCustomers(),
      invalidateQuotes(),
      invalidateProductUnits(),
      invalidateJobs(),
      invalidateAudit(),
    ]);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>Merge into…</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {confirming ? 'Confirm customer merge' : 'Merge customer'}
            <HelpLink label="How to merge duplicate Customers" topic="customerMerge" />
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? 'Review what will move before permanently deleting this duplicate.'
              : `Choose the customer that should survive ${customer.companyName}.`}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <p className="text-sm">
            {preview.data && target
              ? formatCustomerMergeConfirmation({
                  ...preview.data,
                  sourceName: customer.companyName,
                  targetName: target.companyName,
                })
              : preview.error
                ? 'Unable to load the merge counts.'
                : 'Loading merge counts…'}
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="customer-merge-target">Merge into</FieldLabel>
            <SearchableCombobox
              disabled={customers.query.isPending}
              emptyMessage="No other customers found."
              inputId="customer-merge-target"
              onValueChange={setTargetId}
              options={options}
              placeholder="Search customers"
              value={targetId}
            />
          </Field>
        )}

        <DialogFooter>
          {confirming ? (
            <Button
              disabled={mergeMutation.isPending}
              onClick={() => setConfirming(false)}
              type="button"
              variant="outline"
            >
              Back
            </Button>
          ) : (
            <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
          )}
          {confirming ? (
            <Button
              disabled={!preview.data || mergeMutation.isPending}
              onClick={() => void confirmMerge()}
              type="button"
              variant="destructive"
            >
              {mergeMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Merge customer
            </Button>
          ) : (
            <Button disabled={!target} onClick={() => setConfirming(true)} type="button">
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
