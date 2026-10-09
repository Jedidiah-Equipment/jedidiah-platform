import { formatNumber } from '@pkg/domain';
import { breakdownStatusLabels, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import {
  type BreakdownFilterOptions,
  type BreakdownSummary,
  breakdownStatuses,
  breakdownUrgencies,
  type Mechanic,
} from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { MechanicCombobox } from '@/contracting/components/MechanicCombobox.js';
import {
  FARM_COLUMN_ID,
  JOB_COLUMN_ID,
  MECHANIC_COLUMN_ID,
  REPORTED_COLUMN_ID,
  REPORTER_COLUMN_ID,
  STATUS_COLUMN_ID,
  SUBJECT_COLUMN_ID,
  subjectFilterValue,
  URGENCY_COLUMN_ID,
} from './types.js';

const urgencyFilterOptions = breakdownUrgencies.map((urgency) => ({
  value: urgency,
  label: breakdownUrgencyLabels[urgency],
}));

const statusFilterOptions = breakdownStatuses.map((status) => ({
  value: status,
  label: breakdownStatusLabels[status],
}));

const toOption = (person: Mechanic) => ({ value: person.id, label: person.name });

/** The Workshop table's columns: one value each, Reported first, filterable from what the server says exists. */
export function useWorkshopColumns({
  canManage,
  filters,
  mechanics,
  onAssignMechanic,
}: {
  canManage: boolean;
  filters: BreakdownFilterOptions | undefined;
  mechanics: readonly Mechanic[] | undefined;
  onAssignMechanic: (input: { id: string; mechanicUserId: string | null }) => void;
}) {
  const filterOptions = useMemo(
    () => ({
      subjects: (filters?.subjects ?? []).map((subject) => ({
        value: subjectFilterValue(subject),
        label: subject.kind === 'implement' ? `${subject.code} (implement)` : subject.code,
      })),
      jobs: (filters?.jobs ?? []).map((job) => ({ value: job.id, label: job.jobNumber })),
      farms: (filters?.farms ?? []).map((farm) => ({ value: farm.id, label: farm.name })),
      reporters: (filters?.reporters ?? []).map(toOption),
    }),
    [filters],
  );
  const mechanicOptions = useMemo(() => (mechanics ?? []).map(toOption), [mechanics]);
  return useMemo<DataTableColumnDef<BreakdownSummary>[]>(
    () => [
      {
        id: REPORTED_COLUMN_ID,
        accessorKey: 'reportedAt',
        header: 'Reported',
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterVariant: 'date-range', headerClassName: 'w-36', cellClassName: 'w-36 whitespace-nowrap' },
        cell: ({ row }) => <DateDisplay date={row.original.reportedAt} format="medium" />,
      },
      {
        id: URGENCY_COLUMN_ID,
        accessorKey: 'urgency',
        header: 'Code',
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterOptions: urgencyFilterOptions, filterVariant: 'multi-select', headerClassName: 'w-32' },
        cell: ({ row }) => <BreakdownUrgencyIcon urgency={row.original.urgency} />,
      },
      {
        id: SUBJECT_COLUMN_ID,
        accessorFn: (breakdown) => subjectFilterValue(breakdown.subject),
        header: 'Subject',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.subjects, filterVariant: 'multi-select' },
        cell: ({ row }) => {
          const { subject } = row.original;
          return (
            <CategoryLabel
              className="min-w-36"
              icon={subject.categoryIcon}
              colour={subject.categoryColour}
              name={
                <span className="font-mono font-semibold">
                  {subject.code}
                  {subject.kind === 'implement' ? <span className="font-sans font-normal"> (implement)</span> : null}
                </span>
              }
            />
          );
        },
      },
      {
        id: 'problem',
        accessorKey: 'firstLine',
        header: 'Problem',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="max-w-64 min-w-40 truncate text-muted-foreground" title={row.original.firstLine}>
            {row.original.firstLine}
          </div>
        ),
      },
      {
        id: JOB_COLUMN_ID,
        accessorKey: 'jobId',
        header: 'Job',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.jobs, filterVariant: 'multi-select' },
        cell: ({ row }) =>
          row.original.jobNumber ? (
            <Link
              className="font-mono font-semibold whitespace-nowrap hover:underline"
              onClick={(event) => event.stopPropagation()}
              params={{ code: row.original.jobNumber }}
              to="/contracting/jobs/$code"
            >
              {row.original.jobNumber}
            </Link>
          ) : (
            <span className="text-muted-foreground">No Job</span>
          ),
      },
      {
        id: FARM_COLUMN_ID,
        accessorKey: 'farmId',
        header: 'Farm',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.farms, filterVariant: 'multi-select' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.farmName ?? ''}</span>,
      },
      {
        id: REPORTER_COLUMN_ID,
        accessorKey: 'reportedByUserId',
        header: 'Reporter',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.reporters, filterVariant: 'multi-select' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.reporterName}</span>,
      },
      {
        id: MECHANIC_COLUMN_ID,
        accessorKey: 'primaryMechanicUserId',
        header: 'Mechanic',
        enableColumnFilter: canManage,
        enableSorting: false,
        meta: { filterOptions: mechanicOptions, filterVariant: 'multi-select' },
        cell: ({ row }) =>
          canManage && row.original.status !== 'solved' ? (
            <MechanicCombobox
              inRow
              inputId={`mechanic-${row.original.id}`}
              options={mechanicOptions}
              value={row.original.primaryMechanicUserId}
              onValueChange={(mechanicUserId) => onAssignMechanic({ id: row.original.id, mechanicUserId })}
            />
          ) : (
            <span className={row.original.mechanicName ? undefined : 'text-muted-foreground'}>
              {row.original.mechanicName ?? 'Unassigned'}
            </span>
          ),
      },
      {
        id: STATUS_COLUMN_ID,
        accessorKey: 'status',
        header: 'Status',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: statusFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-28' },
        cell: ({ row }) => <BreakdownStatusBadge status={row.original.status} />,
      },
      {
        id: 'dispatch',
        header: 'Dispatch',
        cell: ({ row }) =>
          row.original.sameJobOpenCount > 0 ? (
            <span
              className="flex items-center gap-1 text-sm font-medium"
              title="Other fleet on the same Job has Breakdowns not yet Fixed — one trip, several fixes"
            >
              <IconAlertTriangle aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />+
              {formatNumber(row.original.sameJobOpenCount)} on this Job
            </span>
          ) : null,
      },
      {
        id: 'notes',
        header: 'Notes',
        cell: ({ row }) => {
          const { noteCount, firstNote } = row.original;
          if (noteCount === 0) return null;
          if (noteCount === 1 && firstNote !== null)
            return (
              <div className="max-w-64 truncate text-sm text-muted-foreground" title={firstNote}>
                {firstNote}
              </div>
            );
          return <span className="text-muted-foreground">{`${formatNumber(noteCount)} notes`}</span>;
        },
      },
    ],
    [canManage, filterOptions, mechanicOptions, onAssignMechanic],
  );
}
