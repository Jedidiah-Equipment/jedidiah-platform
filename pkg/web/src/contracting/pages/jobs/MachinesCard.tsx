import { formatHours } from '@pkg/domain';
import { readingExceptionTypeColorClassNames, readingExceptionTypeLabels } from '@pkg/domain/contracting';
import type { Assignment, JobDetail, JobReading } from '@pkg/schema/contracting';
import { IconMessage } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Switch } from '@/components/ui/switch.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { ReadingEvidenceBadge } from '@/contracting/components/ReadingEvidence.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { AddMeasurePopover } from './AddMeasurePopover.js';
import { DepartureCaptureDialog } from './DepartureCaptureDialog.js';
import { GapResolveDialog } from './GapResolveDialog.js';
import { PlanMachineDialog } from './PlanMachineDialog.js';
import { ReadingSheet } from './ReadingSheet.js';
import { groupStints, type jobCapabilities, type StintRow } from './types.js';

type Capabilities = ReturnType<typeof jobCapabilities>;
type SelectedReading = { reading: JobReading; stint: Assignment };
type AttentionKind = JobReading['needsALook'][number];

function AttentionBadge({ kind }: { kind: AttentionKind }) {
  const type = kind === 'disputed' ? 'disputed' : kind === 'missing-photo' ? null : 'ai-flagged';
  return (
    <Badge
      variant="outline"
      className={
        type
          ? cn(readingExceptionTypeColorClassNames[type].chip, readingExceptionTypeColorClassNames[type].text)
          : undefined
      }
    >
      {type ? readingExceptionTypeLabels[type] : 'No photo'}
    </Badge>
  );
}

function ReadingCell({
  reading,
  stint,
  onOpen,
}: {
  reading: JobReading | null;
  stint: Assignment;
  onOpen: (selected: SelectedReading) => void;
}) {
  if (!reading) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="link" onClick={() => onOpen({ reading, stint })}>
        {formatHours(reading.value)}
      </Button>
      <ReadingEvidenceBadge reading={reading} onPreview={() => onOpen({ reading, stint })} />
      {reading.comment ? (
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-help" />}>
            <IconMessage size={16} aria-label="Capture comment" />
          </TooltipTrigger>
          <TooltipContent>{reading.comment}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

export function MachinesCard({ job, capabilities }: { job: JobDetail; capabilities: Capabilities }) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const [planning, setPlanning] = useState(false);
  const [reading, setReading] = useState<SelectedReading | null>(null);
  const [gap, setGap] = useState<Assignment | null>(null);
  const [departure, setDeparture] = useState<Assignment | null>(null);
  const implementOptions = useQuery(
    trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: capabilities.planStints }),
  );
  const drivers = useQuery(
    trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: capabilities.planStints }),
  );
  const patch = useMutation(
    trpc.contractingJobs.stints.patch.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to update Machine Assignment.'),
    }),
  );
  const remove = useMutation(
    trpc.contractingJobs.stints.remove.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to remove Machine Assignment.'),
    }),
  );
  const removeMeasure = useMutation(
    trpc.contractingJobs.measures.remove.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to remove Measure.'),
    }),
  );
  const rows = useMemo(() => groupStints(job.assignments), [job.assignments]);
  const columns = useMemo<DataTableColumnDef<StintRow>[]>(
    () => [
      {
        id: 'machine',
        header: 'Machine',
        cell: ({ row }) =>
          row.original.kind === 'subtotal' ? (
            <strong>{row.original.machineCode} subtotal</strong>
          ) : row.original.kind === 'planned' || row.original.firstOfMachine ? (
            <CategoryLabel
              icon={row.original.stint.categoryIcon}
              colour={row.original.stint.categoryColour}
              name={row.original.stint.machineCode}
              size={16}
            />
          ) : null,
      },
      {
        id: 'implement',
        header: 'Implement',
        cell: ({ row }) => {
          if (row.original.kind === 'subtotal') return null;
          const stint = row.original.stint;
          return capabilities.planStints && stint.state !== 'left' ? (
            <div>
              <SearchableCombobox
                inputId={`implement-${stint.id}`}
                value={stint.implementId ?? ''}
                options={[
                  { value: '', label: '—' },
                  ...(implementOptions.data ?? []).map((entry) => ({ value: entry.id, label: entry.code })),
                ]}
                onValueChange={(implementId) => patch.mutate({ id: stint.id, implementId: implementId || null })}
              />
            </div>
          ) : (
            (stint.implementCode ?? '—')
          );
        },
      },
      {
        id: 'driver',
        header: 'Driver',
        cell: ({ row }) => {
          if (row.original.kind === 'subtotal') return null;
          const stint = row.original.stint;
          return capabilities.planStints && stint.state !== 'left' ? (
            <div>
              <SearchableCombobox
                inputId={`driver-${stint.id}`}
                value={stint.driverUserId ?? ''}
                options={[
                  { value: '', label: '—' },
                  ...(drivers.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
                onValueChange={(driverUserId) => patch.mutate({ id: stint.id, driverUserId: driverUserId || null })}
              />
            </div>
          ) : (
            (stint.driverName ?? '—')
          );
        },
      },
      {
        id: 'arrival',
        header: 'Arrival',
        cell: ({ row }) =>
          row.original.kind === 'stint' ? (
            <ReadingCell reading={row.original.stint.arrival} stint={row.original.stint} onOpen={setReading} />
          ) : null,
      },
      {
        id: 'departure',
        header: 'Departure',
        cell: ({ row }) =>
          row.original.kind === 'stint' ? (
            row.original.stint.departure ? (
              <ReadingCell reading={row.original.stint.departure} stint={row.original.stint} onOpen={setReading} />
            ) : row.original.stint.state === 'on-site' ? (
              <div>
                On site{' '}
                {capabilities.signOff || capabilities.resolveGaps ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (row.original.kind === 'stint') setDeparture(row.original.stint);
                    }}
                  >
                    Enter departure reading
                  </Button>
                ) : null}
              </div>
            ) : null
          ) : null,
      },
      {
        id: 'work',
        header: 'Work h',
        cell: ({ row }) =>
          row.original.kind === 'subtotal'
            ? formatHours(row.original.workHours)
            : row.original.kind === 'stint'
              ? row.original.stint.workHours === null
                ? '—'
                : formatHours(row.original.stint.workHours)
              : '—',
      },
      {
        id: 'travel',
        header: 'Travel h',
        cell: ({ row }) => {
          if (row.original.kind === 'subtotal') return formatHours(row.original.travelHours);
          if (row.original.kind === 'planned') return '—';
          const stint = row.original.stint;
          return (
            <div className="space-y-1">
              <div className="flex items-center gap-1">
                {formatHours(stint.travelHours)}{' '}
                <Switch
                  aria-label={`Include travel for ${stint.machineCode}`}
                  checked={stint.travelIncluded}
                  disabled={!capabilities.patchTravel}
                  onCheckedChange={(travelIncluded) => patch.mutate({ id: stint.id, travelIncluded })}
                />{' '}
                <span>Included</span>
              </div>
              {stint.gapFlag ? (
                <div>
                  <Badge variant="destructive">Gap flag</Badge>{' '}
                  {capabilities.resolveGaps ? (
                    <Button size="sm" variant="outline" onClick={() => setGap(stint)}>
                      Resolve
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {stint.gapResolved ? (
                <Tooltip>
                  <TooltipTrigger render={<span className="cursor-help" />}>
                    {formatHours(stint.travelHours)} travel · {formatHours(stint.unaccountedHours)} unaccounted
                  </TooltipTrigger>
                  <TooltipContent>{stint.gapReason ?? 'Gap split recorded'}</TooltipContent>
                </Tooltip>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'measures',
        header: 'Measures',
        cell: ({ row }) => {
          if (row.original.kind === 'subtotal')
            return Object.entries(row.original.measures).map(([name, quantity]) => (
              <Badge key={name} variant="outline">
                {quantity} {name}
              </Badge>
            ));
          if (row.original.kind === 'planned') return null;
          const stint = row.original.stint;
          return (
            <div className="flex flex-wrap gap-1">
              {stint.measures.map((item) => (
                <Badge key={item.id} variant="outline">
                  {item.quantity} {item.measureTypeName}
                  {capabilities.editMeasures ? (
                    <button
                      type="button"
                      aria-label={`Remove ${item.measureTypeName}`}
                      onClick={() =>
                        removeMeasure.mutate({ assignmentId: stint.id, measureTypeId: item.measureTypeId })
                      }
                    >
                      {' '}
                      ×
                    </button>
                  ) : null}
                </Badge>
              ))}
              {capabilities.editMeasures ? <AddMeasurePopover stint={stint} /> : null}
            </div>
          );
        },
      },
      {
        id: 'attention',
        header: 'Needs a look',
        cell: ({ row }) =>
          row.original.kind === 'stint' ? (
            <div className="flex flex-wrap gap-1">
              {row.original.stint.gapFlag ? <Badge variant="destructive">Gap flag</Badge> : null}
              {[
                ...(row.original.stint.arrival?.needsALook ?? []).map((kind) => ({ kind, role: 'arrival' })),
                ...(row.original.stint.departure?.needsALook ?? []).map((kind) => ({ kind, role: 'departure' })),
              ].map(({ kind, role }) => (
                <AttentionBadge key={`${role}-${kind}`} kind={kind} />
              ))}
            </div>
          ) : null,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) =>
          row.original.kind === 'planned' && capabilities.planStints ? (
            <RemoveEntityButton
              title="Remove planned Machine"
              description="Remove this Machine Assignment?"
              triggerIconOnly
              triggerLabel={`Remove ${row.original.stint.machineCode}`}
              triggerSize="icon-sm"
              isPending={remove.isPending}
              onConfirm={() => {
                if (row.original.kind === 'planned') remove.mutate({ id: row.original.stint.id });
              }}
            />
          ) : null,
      },
    ],
    [
      capabilities,
      implementOptions.data,
      drivers.data,
      patch.mutate,
      remove.isPending,
      remove.mutate,
      removeMeasure.mutate,
    ],
  );
  const table = useDataTable({ data: rows, columns });
  const attention = job.assignments.flatMap((stint) =>
    [stint.arrival, stint.departure].flatMap((item) => (item?.needsALook.length ? [{ stint, reading: item }] : [])),
  );
  const gaps = job.assignments.filter((stint) => stint.gapFlag);
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Machines</CardTitle>
          {capabilities.planStints ? (
            <CardAction>
              <Button onClick={() => setPlanning(true)}>Plan machine</Button>
            </CardAction>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <ErrorMessage
            error={patch.error ?? remove.error ?? removeMeasure.error}
            fallbackMessage="Unable to update Machines."
          />
          <DataTable
            table={table}
            paginationMode="complete"
            total={rows.length}
            emptyMessage="No Machines planned."
            hideGlobalFilter
            getRowClassName={(row) => (row.kind === 'planned' ? 'opacity-60' : undefined)}
          />
          {attention.length || gaps.length ? (
            <div className="rounded-lg border p-3">
              <h3 className="font-medium">Needs a look</h3>
              {attention.map(({ stint, reading }) => (
                <div key={reading.id} className="flex items-center justify-between gap-2 py-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {stint.machineCode} · {reading.role === 'arrival' ? 'Arrival' : 'Departure'}
                    {reading.needsALook.map((kind) => (
                      <AttentionBadge key={kind} kind={kind} />
                    ))}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setReading({ stint, reading })}>
                    Open
                  </Button>
                </div>
              ))}
              {gaps.map((stint) => (
                <div key={stint.id} className="flex items-center justify-between gap-2 py-1">
                  <span>{stint.machineCode} · Gap Flag</span>
                  {capabilities.resolveGaps ? (
                    <Button size="sm" variant="outline" onClick={() => setGap(stint)}>
                      Resolve
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : job.status === 'active' ? (
            <p className="text-muted-foreground">Nothing needs a look</p>
          ) : null}
        </CardContent>
      </Card>
      <PlanMachineDialog jobId={job.id} open={planning} onOpenChange={setPlanning} />
      <GapResolveDialog stint={gap} onClose={() => setGap(null)} />
      <DepartureCaptureDialog stint={departure} onClose={() => setDeparture(null)} />
      <ReadingSheet selected={reading} onClose={() => setReading(null)} amendReadings={capabilities.amendReadings} />
    </>
  );
}
