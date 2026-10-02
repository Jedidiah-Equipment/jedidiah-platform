import { formatCurrency } from '@pkg/domain';
import type { ChargeLine } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useTRPC } from '@/lib/trpc.js';
import { ChargeLineDescription } from './ChargeLineEditing.js';
import { MoneyInput } from './MoneyInput.js';
import { useJobWrite } from './use-job-write.js';

const missingAmountCopy = {
  'needs-amount': <span className="text-destructive">Needs an amount</span>,
  'set-at-pricing': <span className="text-muted-foreground">Set at pricing</span>,
};

export function ChargeLinesTable({
  lines,
  editable,
  amountEditable,
  missingAmount,
}: {
  lines: ChargeLine[];
  /** Rename and remove lines. */
  editable: boolean;
  /** Type amounts. */
  amountEditable: boolean;
  /** What a line without an amount reads while amounts cannot be typed. */
  missingAmount: keyof typeof missingAmountCopy;
}) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const patch = useMutation(
    trpc.contractingJobs.chargeLines.patch.mutationOptions(write.card('Unable to update Charge Line.')),
  );
  const remove = useMutation(
    trpc.contractingJobs.chargeLines.remove.mutationOptions(write.card('Unable to remove Charge Line.')),
  );
  const columns = useMemo<DataTableColumnDef<ChargeLine>[]>(
    () => [
      {
        id: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <ChargeLineDescription
            key={row.original.id}
            line={row.original}
            editable={editable}
            onSave={(description) => patch.mutate({ id: row.original.id, description })}
          />
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
        cell: ({ row }) =>
          amountEditable ? (
            <div className="flex justify-end [&_input]:text-right">
              <MoneyInput
                label={`Amount for ${row.original.description}`}
                value={row.original.amount}
                onCommit={(amount) => patch.mutate({ id: row.original.id, amount })}
              />
            </div>
          ) : row.original.amount === null ? (
            missingAmountCopy[missingAmount]
          ) : (
            <span>{formatCurrency(row.original.amount)}</span>
          ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          editable ? (
            <RemoveEntityButton
              title="Remove Charge Line"
              description="Remove this Charge Line?"
              triggerIconOnly
              triggerLabel={`Remove ${row.original.description}`}
              triggerSize="icon-sm"
              isPending={remove.isPending}
              onConfirm={() => remove.mutate({ id: row.original.id })}
            />
          ) : null,
      },
    ],
    [editable, amountEditable, missingAmount, patch.mutate, remove.isPending, remove.mutate],
  );
  const table = useDataTable({ columns, data: lines, getRowId: (line) => line.id });
  return (
    <DataTable
      table={table}
      paginationMode="complete"
      total={lines.length}
      hideGlobalFilter
      hideFooter
      emptyMessage="No Charge Lines."
    />
  );
}
