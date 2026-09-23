import { formatHours } from '@pkg/domain';
import {
  readingExceptionTypeColorClassNames,
  readingExceptionTypeLabels,
  type StintRow,
} from '@pkg/domain/contracting';
import type { Assignment, JobReading } from '@pkg/schema/contracting';
import { IconMessage } from '@tabler/icons-react';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Switch } from '@/components/ui/switch.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { ReadingEvidenceBadge } from '@/contracting/components/ReadingEvidence.js';
import { cn } from '@/lib/utils.js';
import { AddMeasurePopover } from './AddMeasurePopover.js';
import { useMachines } from './machines-context.js';

export const machineColumns: DataTableColumnDef<StintRow>[] = [
  { id: 'machine', header: 'Machine', cell: ({ row }) => <MachineCell row={row.original} /> },
  {
    id: 'implement',
    header: 'Implement',
    cell: ({ row }) => (row.original.kind === 'subtotal' ? null : <ImplementCell stint={row.original.stint} />),
  },
  {
    id: 'driver',
    header: 'Driver',
    cell: ({ row }) => (row.original.kind === 'subtotal' ? null : <DriverCell stint={row.original.stint} />),
  },
  {
    id: 'arrival',
    header: 'Arrival',
    cell: ({ row }) =>
      row.original.kind === 'stint' ? (
        <ReadingCell reading={row.original.stint.arrival} stint={row.original.stint} />
      ) : null,
  },
  {
    id: 'departure',
    header: 'Departure',
    cell: ({ row }) => (row.original.kind === 'stint' ? <DepartureCell stint={row.original.stint} /> : null),
  },
  {
    id: 'work',
    header: 'Work',
    cell: ({ row }) =>
      row.original.kind === 'subtotal'
        ? formatHours(row.original.workHours)
        : row.original.kind === 'stint' && row.original.stint.workHours !== null
          ? formatHours(row.original.stint.workHours)
          : '—',
  },
  { id: 'travel', header: 'Travel', cell: ({ row }) => <TravelCell row={row.original} /> },
  { id: 'measures', header: 'Measures', cell: ({ row }) => <MeasuresCell row={row.original} /> },
  {
    id: 'attention',
    header: 'Needs a look',
    cell: ({ row }) => (row.original.kind === 'stint' ? <AttentionCell stint={row.original.stint} /> : null),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => (row.original.kind === 'planned' ? <RemovePlannedCell stint={row.original.stint} /> : null),
  },
];

export function AttentionBadge({ kind }: { kind: JobReading['needsALook'][number] }) {
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

function MachineCell({ row }: { row: StintRow }) {
  if (row.kind === 'subtotal') return <strong>{row.machineCode} subtotal</strong>;
  if (row.kind === 'stint' && !row.firstOfMachine) return null;
  return (
    <CategoryLabel
      icon={row.stint.categoryIcon}
      colour={row.stint.categoryColour}
      name={row.stint.machineCode}
      size={16}
    />
  );
}

function ImplementCell({ stint }: { stint: Assignment }) {
  const { capabilities, implementOptions, mutations } = useMachines();
  if (!capabilities.planStints || stint.state === 'left') return stint.implementCode ?? '—';
  return (
    <div>
      <SearchableCombobox
        inputId={`implement-${stint.id}`}
        value={stint.implementId ?? ''}
        options={[
          { value: '', label: '—' },
          ...implementOptions.map((entry) => ({ value: entry.id, label: entry.code })),
        ]}
        onValueChange={(implementId) => mutations.patch.mutate({ id: stint.id, implementId: implementId || null })}
      />
    </div>
  );
}

function DriverCell({ stint }: { stint: Assignment }) {
  const { capabilities, drivers, mutations } = useMachines();
  if (!capabilities.planStints || stint.state === 'left') return stint.driverName ?? '—';
  return (
    <div>
      <SearchableCombobox
        inputId={`driver-${stint.id}`}
        value={stint.driverUserId ?? ''}
        options={[{ value: '', label: '—' }, ...drivers.map((entry) => ({ value: entry.id, label: entry.name }))]}
        onValueChange={(driverUserId) => mutations.patch.mutate({ id: stint.id, driverUserId: driverUserId || null })}
      />
    </div>
  );
}

function ReadingCell({ reading, stint }: { reading: JobReading | null; stint: Assignment }) {
  const { openReading } = useMachines();
  if (!reading) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="link" onClick={() => openReading({ reading, stint })}>
        {formatHours(reading.value)}
      </Button>
      <ReadingEvidenceBadge reading={reading} onPreview={() => openReading({ reading, stint })} />
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

function DepartureCell({ stint }: { stint: Assignment }) {
  const { capabilities, openDeparture } = useMachines();
  if (stint.departure) return <ReadingCell reading={stint.departure} stint={stint} />;
  if (stint.state !== 'on-site') return null;
  return (
    <div>
      On site{' '}
      {capabilities.signOff || capabilities.resolveGaps ? (
        <Button size="sm" variant="outline" onClick={() => openDeparture(stint)}>
          Enter departure reading
        </Button>
      ) : null}
    </div>
  );
}

function TravelCell({ row }: { row: StintRow }) {
  const { capabilities, mutations, openGap } = useMachines();
  if (row.kind === 'subtotal') return formatHours(row.travelHours);
  if (row.kind === 'planned') return '—';
  const { stint } = row;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        {formatHours(stint.travelHours)}{' '}
        <Switch
          aria-label={`Include travel for ${stint.machineCode}`}
          checked={stint.travelIncluded}
          disabled={!capabilities.patchTravel}
          onCheckedChange={(travelIncluded) => mutations.patch.mutate({ id: stint.id, travelIncluded })}
        />{' '}
        <span>Included</span>
      </div>
      {stint.gapFlag ? (
        <div>
          <Badge variant="destructive">Gap flag</Badge>{' '}
          {capabilities.resolveGaps ? (
            <Button size="sm" variant="outline" onClick={() => openGap(stint)}>
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
}

function MeasuresCell({ row }: { row: StintRow }) {
  const { capabilities, mutations } = useMachines();
  if (row.kind === 'subtotal')
    return Object.entries(row.measures).map(([name, quantity]) => (
      <Badge key={name} variant="outline">
        {quantity} {name}
      </Badge>
    ));
  if (row.kind === 'planned') return null;
  const { stint } = row;
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
                mutations.removeMeasure.mutate({ assignmentId: stint.id, measureTypeId: item.measureTypeId })
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
}

function AttentionCell({ stint }: { stint: Assignment }) {
  return (
    <div className="flex flex-wrap gap-1">
      {stint.gapFlag ? <Badge variant="destructive">Gap flag</Badge> : null}
      {[
        ...(stint.arrival?.needsALook ?? []).map((kind) => ({ kind, role: 'arrival' })),
        ...(stint.departure?.needsALook ?? []).map((kind) => ({ kind, role: 'departure' })),
      ].map(({ kind, role }) => (
        <AttentionBadge key={`${role}-${kind}`} kind={kind} />
      ))}
    </div>
  );
}

function RemovePlannedCell({ stint }: { stint: Assignment }) {
  const { capabilities, mutations } = useMachines();
  if (!capabilities.planStints) return null;
  return (
    <RemoveEntityButton
      title="Remove planned Machine"
      description="Remove this Machine Assignment?"
      triggerIconOnly
      triggerLabel={`Remove ${stint.machineCode}`}
      triggerSize="icon-sm"
      isPending={mutations.remove.isPending}
      onConfirm={() => mutations.remove.mutate({ id: stint.id })}
    />
  );
}
