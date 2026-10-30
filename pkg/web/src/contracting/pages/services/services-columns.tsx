import { formatDate, getFirstName } from '@pkg/domain';
import { knownHoursSourceSuffix, serviceRecordStatusLabels } from '@pkg/domain/contracting';
import { type ServiceRecordFilterOptions, serviceRecordStatuses } from '@pkg/schema/contracting';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { hoursOrDash, NextServiceDue } from '@/contracting/components/MachineServiceDue.js';
import { StatusChip } from '@/contracting/components/StatusChip.js';
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

/**
 * The Services table's columns, read straight off the row model; the Book a service column shows only to those who
 * may, and the Machine filter only where the table spans more than one Machine.
 */
export function useServicesColumns({
  filters,
  hasMachineFilter,
  onBookService,
}: {
  filters: ServiceRecordFilterOptions | undefined;
  hasMachineFilter: boolean;
  onBookService: ((machineId: string) => void) | undefined;
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
        accessorFn: (row) => row.machine.id,
        header: 'Machine',
        enableColumnFilter: hasMachineFilter,
        enableSorting: false,
        meta: { filterOptions: filterOptions.machines, filterVariant: 'multi-select' },
        cell: ({ row: { original } }) => (
          <CategoryLabel
            className="min-w-36"
            icon={original.machine.categoryIcon}
            colour={original.machine.categoryColour}
            name={
              <span>
                <span className="font-mono font-semibold">{original.machine.code}</span> {original.machine.categoryName}
              </span>
            }
          />
        ),
      },
      {
        id: MECHANIC_COLUMN_ID,
        accessorFn: (row) => row.mechanic?.id ?? null,
        header: 'Mechanic',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.mechanics, filterVariant: 'multi-select' },
        cell: ({ row: { original } }) => (
          <span className="whitespace-nowrap">{original.mechanic ? getFirstName(original.mechanic.name) : null}</span>
        ),
      },
      {
        id: START_COLUMN_ID,
        accessorFn: (row) => row.startDate,
        header: 'Start',
        enableColumnFilter: false,
        enableSorting: true,
        meta: { headerClassName: 'w-32', cellClassName: 'w-32 whitespace-nowrap' },
        cell: ({ row: { original } }) => (original.startDate ? formatDate(original.startDate, 'short') : null),
      },
      {
        id: 'reading',
        header: 'Reading',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row: { original } }) => (
          <span className="flex flex-col">
            {hoursOrDash(original.reading.hours)}
            {original.reading.at ? (
              <span className="text-xs text-muted-foreground">
                <DateDisplay date={original.reading.at} format="medium" />
                {knownHoursSourceSuffix(original.reading.source)}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'nextServiceDue',
        header: 'Next service due',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row: { original } }) =>
          original.nextServiceDue.hours === null ? hoursOrDash(null) : <NextServiceDue {...original.nextServiceDue} />,
      },
      {
        id: STATUS_COLUMN_ID,
        accessorFn: (row) => row.status,
        header: 'Status',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: statusFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-28' },
        cell: ({ row: { original } }) => <StatusChip {...original.badge} />,
      },
      {
        id: 'notes',
        header: 'Notes',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row: { original } }) => (
          <div className="max-w-64 truncate text-sm text-muted-foreground" title={original.notes ?? undefined}>
            {original.notes}
          </div>
        ),
      },
      ...(onBookService
        ? [
            {
              id: 'actions',
              header: '',
              enableColumnFilter: false,
              enableSorting: false,
              meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
              cell: ({ row: { original } }) =>
                original.pinned ? (
                  <Button
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onBookService(original.machine.id);
                    }}
                  >
                    Book a service
                  </Button>
                ) : null,
            } satisfies DataTableColumnDef<ServicesTableRow>,
          ]
        : []),
    ],
    [filterOptions, hasMachineFilter, onBookService],
  );
}
