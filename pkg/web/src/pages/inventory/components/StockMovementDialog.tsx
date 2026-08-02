import { useDebouncedValue } from '@mantine/hooks';
import type { InventoryJobOption, InventoryJobOptionListInput, StockMovementPostResult } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EntityCombobox } from '@/components/common/EntityCombobox.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Field, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { StockMovementWarningPrompt, warningMessageFor } from './StockMovementWarningPrompt.js';
import { StockPartSelect } from './StockPartSelect.js';
import {
  deriveJobMovementWarnings,
  type JobMovementWarningCode,
  parseJobMovementForm,
  type StockPartOption,
} from './types.js';

const inventoryJobsInput = (search: string) =>
  ({
    cursor: 0,
    limit: 20,
    search,
    sortBy: 'createdAt',
    sortDirection: 'desc',
  }) satisfies InventoryJobOptionListInput;

type FixedJob = { code: string; id: string };

export function StockMovementDialog({
  fixedJob,
  initialPartId,
  items,
  onOpenChange,
  open,
  parts,
  type,
}: {
  fixedJob?: FixedJob;
  initialPartId?: string;
  items: Parameters<typeof deriveJobMovementWarnings>[0]['stockOnHand'];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  parts: readonly StockPartOption[];
  type: 'checkout' | 'return-to-store';
}) {
  const trpc = useTRPC();
  const { invalidateInventory } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const initialPart = parts.find((part) => part.partId === initialPartId) ?? parts[0];
  const [jobSearch, setJobSearch] = useState('');
  const [debouncedJobSearch] = useDebouncedValue(jobSearch, 250);
  const [selectedJob, setSelectedJob] = useState<InventoryJobOption | null>(null);
  const jobId = fixedJob?.id ?? selectedJob?.id ?? '';
  const [partId, setPartId] = useState(initialPart?.partId ?? '');
  const [quantity, setQuantity] = useState('');
  const [lengthMm, setLengthMm] = useState(
    initialPart?.standardPurchaseLengthMm === null || initialPart?.standardPurchaseLengthMm === undefined
      ? ''
      : String(initialPart.standardPurchaseLengthMm),
  );
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [pendingWarnings, setPendingWarnings] = useState<JobMovementWarningCode[]>([]);
  const [pendingInputKey, setPendingInputKey] = useState<string | null>(null);
  const jobsQuery = useQuery(
    trpc.inventory.jobOptions.queryOptions(inventoryJobsInput(debouncedJobSearch), { enabled: fixedJob === undefined }),
  );
  const jobStockQuery = useQuery(trpc.inventory.jobStock.queryOptions({ jobId }, { enabled: jobId.length > 0 }));
  const selectedPart = parts.find((part) => part.partId === partId) ?? initialPart;

  const handleSuccess = async (result: StockMovementPostResult) => {
    for (const warning of warningCodesFromResult(result)) {
      toast.warning(warningMessageFor(warning));
    }
    await invalidateInventory();
    onOpenChange(false);
    toast.success(type === 'checkout' ? 'Stock checked out' : 'Stock returned to store');
  };
  const handleError = (error: unknown) =>
    showMutationError(error, type === 'checkout' ? 'Unable to check stock out.' : 'Unable to return stock.');
  const checkoutMutation = useMutation(
    trpc.inventory.postCheckout.mutationOptions({ onError: handleError, onSuccess: handleSuccess }),
  );
  const returnMutation = useMutation(
    trpc.inventory.postReturnToStore.mutationOptions({ onError: handleError, onSuccess: handleSuccess }),
  );
  const mutation = type === 'checkout' ? checkoutMutation : returnMutation;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPart) {
      setValidationMessage('Select a Part.');
      return;
    }

    const parsed = parseJobMovementForm({ part: selectedPart, values: { jobId, lengthMm, partId, quantity } });
    if (!parsed.success) {
      setValidationMessage(parsed.error.issues[0]?.message ?? 'Check the movement details.');
      return;
    }

    const warnings = deriveJobMovementWarnings({
      jobStock: jobStockQuery.data?.items.find((row) => row.partId === selectedPart.partId),
      lengthMm: parsed.data.lengthMm,
      part: selectedPart,
      quantity: parsed.data.quantity,
      stockOnHand: items,
      type,
    });
    const inputKey = JSON.stringify(parsed.data);
    if (warnings.length > 0 && pendingInputKey !== inputKey) {
      setPendingInputKey(inputKey);
      setPendingWarnings(warnings);
      setValidationMessage(null);
      return;
    }

    setValidationMessage(null);
    mutation.mutate(parsed.data);
  };

  const verb = type === 'checkout' ? 'Check out' : 'Return';

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{verb} stock</DialogTitle>
          <DialogDescription>
            {type === 'checkout'
              ? 'Draw a Part from stock against any Job.'
              : 'Return a previously drawn Part to store.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={submit}>
          {fixedJob ? (
            <Field>
              <FieldLabel>Job</FieldLabel>
              <div className="rounded-md border px-3 py-2 font-mono text-sm">{fixedJob.code}</div>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="inventory-job-movement-job">Job</FieldLabel>
              <EntityCombobox
                disabled={false}
                emptyMessage="No Jobs found"
                inputId="inventory-job-movement-job"
                inputValue={jobSearch}
                isFetching={jobsQuery.isFetching}
                itemToLabel={jobOptionLabel}
                onInputValueChange={setJobSearch}
                onSelected={(job) => {
                  setSelectedJob(job);
                  setJobSearch('');
                  setPendingInputKey(null);
                  setPendingWarnings([]);
                }}
                options={mergeSelectedJobOption(jobsQuery.data?.items ?? [], selectedJob)}
                placeholder="Search Jobs"
                renderItem={(job) => jobOptionLabel(job)}
                searchPlaceholder="Searching Jobs..."
                value={selectedJob}
              />
            </Field>
          )}
          <StockPartSelect
            parts={parts}
            value={selectedPart?.partId ?? partId}
            onChange={(nextPartId) => {
              const nextPart = parts.find((part) => part.partId === nextPartId);
              setPartId(nextPartId);
              setLengthMm(nextPart?.standardPurchaseLengthMm ? String(nextPart.standardPurchaseLengthMm) : '');
              setPendingInputKey(null);
              setPendingWarnings([]);
            }}
          />
          <Field>
            <FieldLabel htmlFor="inventory-job-movement-quantity">Quantity</FieldLabel>
            <Input
              id="inventory-job-movement-quantity"
              min="0.001"
              onChange={(event) => {
                setQuantity(event.target.value);
                setPendingInputKey(null);
                setPendingWarnings([]);
              }}
              required
              step="0.001"
              type="number"
              value={quantity}
            />
          </Field>
          {selectedPart?.unitOfMeasure === 'mm' ? (
            <Field>
              <FieldLabel htmlFor="inventory-job-movement-length">Length (mm)</FieldLabel>
              <Input
                id="inventory-job-movement-length"
                min="1"
                onChange={(event) => {
                  setLengthMm(event.target.value);
                  setPendingInputKey(null);
                  setPendingWarnings([]);
                }}
                required
                step="1"
                type="number"
                value={lengthMm}
              />
            </Field>
          ) : null}
          <StockMovementWarningPrompt warnings={pendingWarnings} />
          {validationMessage ? <p className="text-destructive text-sm">{validationMessage}</p> : null}
          <DialogFooter>
            <DialogClose render={<Button disabled={mutation.isPending} type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={mutation.isPending} type="submit">
              {pendingWarnings.length > 0 ? 'Post anyway' : `${verb} stock`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function warningCodesFromResult(result: StockMovementPostResult): JobMovementWarningCode[] {
  const warnings: JobMovementWarningCode[] = [];
  if (result.warnings.exceedsCfo) warnings.push('exceeds-cfo');
  if (result.warnings.exceedsDrawn) warnings.push('exceeds-drawn');
  if (result.warnings.negativeStockOnHand) warnings.push('negative-stock-on-hand');
  return warnings;
}

function jobOptionLabel(job: InventoryJobOption): string {
  return `${job.code} · ${job.displayName}`;
}

function mergeSelectedJobOption(
  options: readonly InventoryJobOption[],
  selected: InventoryJobOption | null,
): InventoryJobOption[] {
  return selected && !options.some((option) => option.id === selected.id) ? [...options, selected] : [...options];
}
