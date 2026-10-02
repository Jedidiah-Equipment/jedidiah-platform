import { formatCurrency } from '@pkg/domain';
import type { ChargeLine, JobDetail } from '@pkg/schema/contracting';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { AddChargeLineDialog, ChargeLineDescription, useChargeLineMutations } from './ChargeLineEditing.js';
import { MoneyInput } from './MoneyInput.js';

export function ChargeLinesCard({
  job,
  editable,
  addAction,
  amountEditable,
}: {
  job: JobDetail;
  editable: boolean;
  addAction: { disabled: boolean; title: string | undefined } | null;
  amountEditable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const { create, patch, remove } = useChargeLineMutations();
  const columns = useMemo<DataTableColumnDef<ChargeLine>[]>(
    () => [
      {
        id: 'description',
        header: 'Description',
        cell: ({ row }) => (
          <ChargeLineDescription
            line={row.original}
            editable={editable}
            onSave={(description) => patch.mutate({ id: row.original.id, description })}
          />
        ),
      },
      {
        id: 'amount',
        header: 'Amount',
        cell: ({ row }) =>
          amountEditable ? (
            <MoneyInput
              label={`Amount for ${row.original.description}`}
              value={row.original.amount}
              onCommit={(amount) => patch.mutate({ id: row.original.id, amount })}
            />
          ) : row.original.amount === null ? (
            <span className="text-muted-foreground">Set at pricing</span>
          ) : (
            formatCurrency(row.original.amount)
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
    [editable, amountEditable, patch.mutate, remove.isPending, remove.mutate],
  );
  return (
    <>
      <Card id="charge-lines" className="scroll-mt-4">
        <CardHeader>
          <CardTitle>Charge lines</CardTitle>
          {addAction ? (
            <CardAction>
              <Button {...addAction} onClick={() => setAdding(true)}>
                Add charge line
              </Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent>
          <ErrorMessage
            error={create.error ?? patch.error ?? remove.error}
            fallbackMessage="Unable to update Charge Lines."
          />
          <ClientDataTable
            rows={job.chargeLines}
            getRowId={(line) => line.id}
            columns={columns}
            loading={false}
            emptyMessage="No Charge Lines."
            hideGlobalFilter
            onOpen={() => undefined}
          />
        </CardContent>
      </Card>
      <AddChargeLineDialog jobId={job.id} open={adding} onOpenChange={setAdding} create={create} />
    </>
  );
}
