import { hasPermission } from '@pkg/domain';
import type { ProductUnitReassignCandidate, QuoteDetail } from '@pkg/schema';
import { IconArrowsExchange, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
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
import { Textarea } from '@/components/ui/textarea.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { canReceiveReassignedUnit } from './reassign-eligibility.js';

/** The picker line: what an operator needs to recognise a machine without opening it. */
export function describeReassignCandidate(candidate: ProductUnitReassignCandidate): string {
  const owner = candidate.owner ? candidate.owner.companyName : 'Stock';
  const build = candidate.buildState === 'on-hand' ? 'built' : 'in build';

  return [candidate.productSerialNumber, candidate.vinNumber ? `VIN ${candidate.vinNumber}` : null, owner, build]
    .filter((part) => part !== null)
    .join(' · ');
}

/**
 * Moving someone else's machine onto this deal. The dialog picks first and confirms second, because
 * the confirm step is where the displacement and the spec difference become readable — neither is
 * something a person should discover after the fact.
 */
export const ReassignUnitDialog: React.FC<{ quote: QuoteDetail }> = ({ quote }) => {
  const accessQuery = useAccess();
  const canReassign = hasPermission(accessQuery.data, 'equipment_product_unit:reassign');

  if (!canReassign || !canReceiveReassignedUnit(quote)) {
    return null;
  }

  return <ReassignUnitDialogContent quote={quote} />;
};

function ReassignUnitDialogContent({ quote }: { quote: QuoteDetail }) {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateAudit, invalidateJobs, invalidateProductUnits, invalidateQuotes } = useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const [productUnitId, setProductUnitId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState('');

  const candidatesQuery = useQuery(
    trpc.productUnits.reassignCandidates.queryOptions({ quoteId: quote.id }, { enabled: open }),
  );
  const previewQuery = useQuery(
    trpc.productUnits.reassignPreview.queryOptions(
      { productUnitId, quoteId: quote.id },
      { enabled: open && confirming && productUnitId !== '' },
    ),
  );
  const reassignMutation = useMutation(
    trpc.productUnits.reassign.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to reassign the Unit.'),
    }),
  );

  const options = useMemo(
    () =>
      (candidatesQuery.data ?? []).map((candidate) => ({
        label: describeReassignCandidate(candidate),
        value: candidate.id,
      })),
    [candidatesQuery.data],
  );

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setProductUnitId('');
      setConfirming(false);
      setNote('');
    }
  };

  const confirmReassign = async () => {
    if (productUnitId === '') return;

    let result: Awaited<ReturnType<typeof reassignMutation.mutateAsync>>;
    try {
      result = await reassignMutation.mutateAsync({
        note: note.trim() === '' ? null : note.trim(),
        productUnitId,
        toQuoteId: quote.id,
      });
    } catch {
      return;
    }

    await Promise.all([invalidateQuotes(), invalidateJobs(), invalidateProductUnits(), invalidateAudit()]);
    handleOpenChange(false);
    toast.success(
      result.displacedProductSerialNumber
        ? `${result.unit.productSerialNumber} moved to ${quote.code}; ${result.displacedProductSerialNumber} returned to Stock`
        : `${result.unit.productSerialNumber} moved to ${quote.code}`,
    );
  };

  const preview = previewQuery.data;

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogTrigger render={<Button type="button" variant="outline" />}>
        <IconArrowsExchange data-icon="inline-start" />
        Reassign Unit…
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {confirming ? 'Confirm Unit reassignment' : 'Reassign a Unit to this deal'}
            <HelpLink label="How to reassign a Unit" topic="unitReassignment" />
          </DialogTitle>
          <DialogDescription>
            {confirming
              ? 'Review what moves before the machine and its build change hands.'
              : `Choose the machine that should build out ${quote.code}.`}
          </DialogDescription>
        </DialogHeader>

        {confirming ? (
          <div className="grid gap-4 text-sm">
            {preview ? (
              <>
                <p>
                  <span className="font-medium">{preview.incoming.productSerialNumber}</span> and its build Job move to{' '}
                  {quote.code}, and the machine becomes {quote.customerCompanyName}'s.
                </p>
                {preview.displaced ? (
                  <p className="rounded-md border border-warning/40 bg-warning/10 p-3">
                    {preview.displaced.productSerialNumber} returns to Stock; its build continues as a Stock Build, and{' '}
                    {quote.code} keeps no other machine.
                  </p>
                ) : null}
                <SpecDiffList
                  label="Fitted to this machine but not sold on this Quote"
                  names={preview.specDiff.fittedNotQuoted}
                />
                <SpecDiffList
                  label="Sold on this Quote but not fitted to this machine"
                  names={preview.specDiff.quotedNotFitted}
                />
                <p className="text-muted-foreground text-xs">
                  A difference is not a blocker. Pricing and specification stay as this Quote agreed them; amend the
                  Quote separately if the deal has really changed.
                </p>
                <Field>
                  <FieldLabel htmlFor="reassign-note">Reason (optional)</FieldLabel>
                  <Textarea
                    id="reassign-note"
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Why is this machine moving?"
                    rows={3}
                    value={note}
                  />
                </Field>
              </>
            ) : previewQuery.error ? (
              <ErrorMessage error={previewQuery.error} fallbackMessage="Unable to work out what this move would do." />
            ) : (
              <p className="text-muted-foreground">Working out what this move would do…</p>
            )}
          </div>
        ) : (
          <Field>
            <FieldLabel htmlFor="reassign-unit">Unit</FieldLabel>
            <SearchableCombobox
              disabled={candidatesQuery.isPending}
              emptyMessage="No Units of this Product can move onto this deal."
              inputId="reassign-unit"
              onValueChange={setProductUnitId}
              options={options}
              placeholder="Search Units"
              value={productUnitId}
            />
            <ErrorMessage error={candidatesQuery.error} fallbackMessage="Unable to load movable Units." />
          </Field>
        )}

        <DialogFooter>
          {confirming ? (
            <Button
              disabled={reassignMutation.isPending}
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
              disabled={!preview || reassignMutation.isPending}
              onClick={() => void confirmReassign()}
              type="button"
            >
              {reassignMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Reassign Unit
            </Button>
          ) : (
            <Button disabled={productUnitId === ''} onClick={() => setConfirming(true)} type="button">
              Continue
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SpecDiffList({ label, names }: { label: string; names: readonly string[] }) {
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      {names.length === 0 ? (
        <span className="text-muted-foreground">Nothing.</span>
      ) : (
        <ul className="list-inside list-disc">
          {names.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
