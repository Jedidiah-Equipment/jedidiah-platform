import type { Supplier } from '@pkg/schema/equipment';
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
import { useSupplierOptions } from '@/equipment/hooks/options/use-supplier-options.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatSupplierMergeConfirmation, getSupplierMergeOptions } from './supplier-merge.js';

export const MergeSupplierDialog: React.FC<{ supplier: Supplier }> = ({ supplier }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateAudit, invalidateParts, invalidatePurchaseOrders, invalidateSuppliers } = useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const suppliers = useSupplierOptions({ enabled: open, limit: 0 });
  const options = useMemo(() => getSupplierMergeOptions(suppliers.items, supplier.id), [supplier.id, suppliers.items]);
  const target = suppliers.items.find((candidate) => candidate.id === targetId) ?? null;
  const preview = useQuery(
    trpc.suppliers.mergePreview.queryOptions(
      { sourceId: supplier.id },
      { enabled: open && confirming && target !== null },
    ),
  );
  const mergeMutation = useMutation(
    trpc.suppliers.merge.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to merge suppliers.'),
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
    let merged: Supplier;
    try {
      merged = await mergeMutation.mutateAsync({ sourceId: supplier.id, targetId: target.id });
    } catch {
      return;
    }
    await Promise.all([invalidateSuppliers(), invalidateParts(), invalidatePurchaseOrders(), invalidateAudit()]);
    handleOpenChange(false);
    toast.success(`${supplier.companyName} merged into ${merged.companyName}`);
    await navigate({ to: '/equipment/suppliers/$id/edit', params: { id: merged.id } });
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>Merge into…</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {confirming ? 'Confirm supplier merge' : 'Merge supplier'}
            <HelpLink label="How to merge duplicate Suppliers" topic="supplierMerge" />
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? 'Review what will move before permanently retiring this duplicate.'
              : `Choose the supplier that should survive ${supplier.companyName}.`}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <p className="text-sm">
            {preview.data && target
              ? formatSupplierMergeConfirmation({
                  ...preview.data,
                  sourceName: supplier.companyName,
                  targetName: target.companyName,
                })
              : preview.error
                ? 'Unable to load the merge counts.'
                : 'Loading merge counts…'}
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="supplier-merge-target">Merge into</FieldLabel>
            <SearchableCombobox
              disabled={suppliers.isPending}
              emptyMessage="No other suppliers found."
              inputId="supplier-merge-target"
              onValueChange={setTargetId}
              options={options}
              placeholder="Search suppliers"
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
              Merge supplier
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
