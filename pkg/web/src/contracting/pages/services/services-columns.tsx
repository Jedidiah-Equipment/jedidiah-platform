import { formatDate, formatHours, getFirstName } from '@pkg/domain';
import {
  hoursToServiceLabel,
  machineServiceBadge,
  serviceDueStatusColorClassNames,
  serviceRecordStatusColorClassNames,
  serviceRecordStatusLabels,
} from '@pkg/domain/contracting';
import { type ServiceRecordFilterOptions, serviceRecordStatuses } from '@pkg/schema/contracting';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { ServiceBadge } from '@/contracting/components/ServiceBadge.js';
import { cn } from '@/lib/utils.js';
import {
  MACHINE_COLUMN_ID,
  MECHANIC_COLUMN_ID,
  type ServicesTableRow,
  START_COLUMN_ID,
  STATUS_COLUMN_ID,
} from './types.js';

const statusFilterOptions = serviceRecordStatuses.map((status) => ({
  value: status,
  label: serviceRecordStatusLabels[status],
}));

const hoursOrDash = (hours: number | null) =>
  hours === null ? (
    <span className="text-muted-foreground">—</span>
  ) : (
    <span className="tabular-nums">{formatHours(hours)}</span>
  );

/**
 * The Services table's columns. A pinned Machine fills what it has (its latest reading, its Next Service Due and the
 * hours to go) and leaves the Service Record's own columns empty.
 */
export function useServicesColumns({
  filters,
  onRecordService,
}: {
  filters: ServiceRecordFilterOptions | undefined;
  /** Set only when the reader may book a Machine in. */
  onRecordService: ((machineId: string) => void) | undefined;
}) {
  const filterOptions = useMemo(
    () => ({
      machines: (filters?.machines ?? []).map((machine) => ({ value: machine.id, label: machine.code })),
      mechanics: (filters?.mechanics ?? []).map((person) => ({ value: person.id, label: person.name })),
    }),
    [filters],
  );
  return useMemo<DataTableColumnDef<ServicesTableRow>[]>(
    () => [
      {
        id: MACHINE_COLUMN_ID,
        header: 'Machine',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.machines, filterVariant: 'multi-select' },
        cell: ({ row }) => {
          const subject =
            row.original.kind === 'due'
              ? row.original.machine
              : { ...row.original.record, code: row.original.record.machineCode };
          return (
            <CategoryLabel
              className="min-w-36"
              icon={subject.categoryIcon}
              colour={subject.categoryColour}
              name={
                <span>
                  <span className="font-mono font-semibold">{subject.code}</span> {subject.categoryName}
                </span>
              }
            />
          );
        },
      },
      {
        id: MECHANIC_COLUMN_ID,
        header: 'Mechanic',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.mechanics, filterVariant: 'multi-select' },
        cell: ({ row }) =>
          row.original.kind === 'record' && row.original.record.mechanicName ? (
            <span className="whitespace-nowrap">{getFirstName(row.original.record.mechanicName)}</span>
          ) : null,
      },
      {
        id: START_COLUMN_ID,
        header: 'Start',
        enableColumnFilter: false,
        enableSorting: true,
        meta: { headerClassName: 'w-32', cellClassName: 'w-32 whitespace-nowrap' },
        cell: ({ row }) => (row.original.kind === 'record' ? formatDate(row.original.record.startDate, 'short') : null),
      },
      {
        id: 'reading',
        header: 'Reading',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind === 'record') return hoursOrDash(row.original.record.readingAtServiceHours);
          const { latestReadingHours, latestReadingAt } = row.original.machine;
          return (
            <span className="flex flex-col">
              {hoursOrDash(latestReadingHours)}
              {latestReadingAt ? (
                <span className="text-xs text-muted-foreground">
                  <DateDisplay date={latestReadingAt} format="medium" />
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        id: 'nextServiceDue',
        header: 'Next service due',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind === 'record') return hoursOrDash(row.original.record.nextServiceDueHoursSet);
          const { nextServiceDueHours, hoursToService, serviceDueStatus } = row.original.machine;
          return (
            <span className="flex flex-col">
              {hoursOrDash(nextServiceDueHours ?? null)}
              {hoursToService === null ? null : (
                <span className={cn('text-xs font-medium', serviceDueStatusColorClassNames[serviceDueStatus].text)}>
                  {hoursToServiceLabel(hoursToService)}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: STATUS_COLUMN_ID,
        header: 'Status',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: statusFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-28' },
        cell: ({ row }) =>
          row.original.kind === 'due' ? (
            <ServiceBadge {...machineServiceBadge(row.original.machine)} />
          ) : (
            <ServiceBadge
              label={serviceRecordStatusLabels[row.original.record.status]}
              colours={serviceRecordStatusColorClassNames[row.original.record.status]}
            />
          ),
      },
      {
        id: 'notes',
        header: 'Notes',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.kind === 'record' && row.original.record.notes ? (
            <div className="max-w-64 truncate text-sm text-muted-foreground" title={row.original.record.notes}>
              {row.original.record.notes}
            </div>
          ) : null,
      },
      {
        id: 'actions',
        header: '',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => {
          if (row.original.kind !== 'due' || !onRecordService) return null;
          const machineId = row.original.machine.id;
          return (
            <Button
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onRecordService(machineId);
              }}
            >
              Record a service
            </Button>
          );
        },
      },
    ],
    [filterOptions, onRecordService],
  );
}
