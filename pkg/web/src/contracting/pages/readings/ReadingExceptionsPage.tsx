import { formatDate } from '@pkg/domain';
import { ReadingAmendInput, type ReadingException } from '@pkg/schema/contracting';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { getClientConfig } from '@/lib/app-config.js';
import { useTRPC } from '@/lib/trpc.js';

type Reading = ReadingException;
const amendmentValues = ReadingAmendInput.omit({ id: true });
function evidenceLabel(row: Reading) {
  if (!row.photo) return 'Missing Photo Evidence';
  if (row.aiVerification === 'agrees') return 'Photo-backed · AI-verified';
  return `Photo-backed · ${row.aiVerification}`;
}
export function ReadingExceptionsPage() {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [selected, setSelected] = useState<Reading | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const query = useQuery(trpc.contractingReadings.listExceptions.queryOptions());
  const invalidate = () => client.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() });
  const amend = useMutation(trpc.contractingReadings.amend.mutationOptions({ onSuccess: invalidate }));
  const reverify = useMutation(trpc.contractingReadings.reverify.mutationOptions({ onSuccess: invalidate }));
  const columns: DataTableColumnDef<Reading>[] = [
    { accessorKey: 'machineCode', header: 'Machine' },
    {
      id: 'capture',
      header: 'Capture',
      cell: ({ row }) => (
        <div>
          {formatDate(row.original.capturedAt, 'dd MMM yyyy HH:mm')}
          <div className="text-muted-foreground">{row.original.role}</div>
        </div>
      ),
    },
    { accessorKey: 'value', header: 'Hours', cell: ({ row }) => row.original.value.toFixed(1) },
    {
      id: 'evidence',
      header: 'Evidence',
      cell: ({ row: { original: row } }) => (
        <div className="space-y-1">
          <div>{evidenceLabel(row)}</div>
          {row.disputed ? <div>Disputed: {row.disputeReason}</div> : null}
          {row.photo ? (
            <a
              className="underline"
              href={`${getClientConfig().apiBaseUrl}/api/contracting/readings/${row.id}/photo`}
              target="_blank"
              rel="noreferrer"
            >
              View photo
            </a>
          ) : null}
          <div className="text-muted-foreground">{row.aiHint}</div>
        </div>
      ),
    },
    {
      id: 'ai',
      header: 'AI reading / confidence',
      cell: ({ row }) => (
        <div>
          {row.original.aiValue?.toFixed(1) ?? 'Unread'} h
          <div>
            {row.original.aiConfidence === null
              ? 'Confidence unavailable'
              : `${Math.round(row.original.aiConfidence * 100)}% confidence`}
          </div>
        </div>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              amend.reset();
              setSelected(row.original);
            }}
          >
            Amend
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!row.original.photo || reverify.isPending}
            onClick={() => reverify.mutate({ id: row.original.id })}
          >
            Re-verify
          </Button>
        </div>
      ),
    },
  ];
  const table = useDataTable({
    data: query.data ?? [],
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });
  return (
    <>
      <PageLayout
        title="Reading exceptions"
        description="Review disputed readings and photo verification warnings."
        size="lg"
      >
        <ErrorMessage error={query.error ?? reverify.error} fallbackMessage="Unable to load or verify readings." />
        <DataTable
          table={table}
          paginationMode="incremental"
          total={query.data?.length ?? 0}
          isLoading={query.isPending}
          emptyMessage="No Reading Exceptions."
          globalFilterPlaceholder="Search machines..."
        />
      </PageLayout>
      <CreateEntityDialog
        key={selected?.id ?? 'closed'}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Amend Hour Reading"
        description="Check the photo and both disputed readings. Confirm or correct the value and give a reason. This acknowledges the current evidence warning."
        submitLabel="Amend reading"
        defaultValues={{ value: selected?.value ?? 0, reason: '' }}
        validator={amendmentValues}
        onCreate={(values) => amend.mutateAsync(ReadingAmendInput.parse({ ...values, id: selected?.id }))}
        onCreated={() => setSelected(null)}
      >
        {(form) => (
          <>
            <ErrorMessage error={amend.error} fallbackMessage="Unable to amend reading." />
            <form.AppField name="value">{(field) => <field.NumberField label="Hours" />}</form.AppField>
            <form.AppField name="reason">{(field) => <field.TextareaField label="Amendment reason" />}</form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
