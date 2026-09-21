import { formatCurrency } from '@pkg/domain';
import { requiredTrimmedText } from '@pkg/schema';
import type { ChargeLine, JobDetail } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const ChargeLineValues = z.object({ description: requiredTrimmedText('A description is required') });

export function ChargeLinesCard({ job, editable }: { job: JobDetail; editable: boolean }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const [adding, setAdding] = useState(false);
  const create = useMutation(
    trpc.contractingJobs.chargeLines.create.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to add Charge Line.'),
    }),
  );
  const patch = useMutation(
    trpc.contractingJobs.chargeLines.patch.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to update Charge Line.'),
    }),
  );
  const remove = useMutation(
    trpc.contractingJobs.chargeLines.remove.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to remove Charge Line.'),
    }),
  );
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
          row.original.amount === null ? (
            <span className="text-muted-foreground">Jed at pricing</span>
          ) : (
            formatCurrency(row.original.amount, 'ZAR')
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
    [editable, patch.mutate, remove.isPending, remove.mutate],
  );
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Charge lines</CardTitle>
          {editable ? (
            <CardAction>
              <Button onClick={() => setAdding(true)}>Add charge line</Button>
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
            columns={columns}
            loading={false}
            emptyMessage="No Charge Lines."
            searchPlaceholder="Search Charge Lines…"
            onOpen={() => undefined}
          />
        </CardContent>
      </Card>
      <CreateEntityDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add charge line"
        defaultValues={{ description: '' }}
        validator={ChargeLineValues}
        onCreate={(values) => create.mutateAsync({ jobId: job.id, description: values.description })}
        onCreated={() => setAdding(false)}
      >
        {(form) => (
          <form.AppField name="description">{(field) => <field.TextField label="Description" />}</form.AppField>
        )}
      </CreateEntityDialog>
    </>
  );
}

function ChargeLineDescription({
  line,
  editable,
  onSave,
}: {
  line: ChargeLine;
  editable: boolean;
  onSave: (description: string) => void;
}) {
  const [description, setDescription] = useState(line.description);
  if (!editable) return <span>{line.description}</span>;
  return (
    <Input
      aria-label="Charge Line description"
      value={description}
      onChange={(event) => setDescription(event.target.value)}
      onBlur={() => {
        const trimmed = description.trim();
        if (trimmed && trimmed !== line.description) onSave(trimmed);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
