import { formatHours, formatNumber } from '@pkg/domain';
import type {
  CategoryUtilisation,
  HourKindTotals,
  MachineUtilisation,
  UtilisationTrendSubject,
} from '@pkg/schema/contracting';
import { IconChevronDown } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader } from '@/components/ui/card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { cn } from '@/lib/utils.js';
import { percentOrDash as percent } from './report-format.js';

const hoursColumn = (key: keyof HourKindTotals, header: string): DataTableColumnDef<MachineUtilisation> => ({
  accessorKey: key,
  header,
  cell: ({ row }) => <span className="tabular-nums">{formatHours(row.original[key])}</span>,
});

const columns: DataTableColumnDef<MachineUtilisation>[] = [
  {
    accessorKey: 'code',
    header: 'Machine',
    cell: ({ row }) => (
      <span className="flex items-center gap-2">
        <Link
          to="/contracting/fleet/$id/edit"
          params={{ id: row.original.machineId }}
          className="font-medium hover:underline"
        >
          {row.original.code}
        </Link>
        {row.original.retiredDate ? <Badge variant="outline">Retired</Badge> : null}
      </span>
    ),
  },
  { accessorKey: 'activeDays', header: 'Active days', cell: ({ row }) => formatNumber(row.original.activeDays) },
  { accessorKey: 'fleetDays', header: 'Fleet days', cell: ({ row }) => formatNumber(row.original.fleetDays) },
  {
    accessorKey: 'utilisationPercent',
    header: 'Utilisation',
    cell: ({ row }) => percent(row.original.utilisationPercent),
  },
  hoursColumn('workHours', 'Work'),
  hoursColumn('travelHours', 'Travel'),
];

/** One Category's Machines for the window, its totals in the header; a row or the button picks the trend's subject. */
export function CategoryUtilisationCard({
  category,
  subject,
  onSubjectChange,
}: {
  category: CategoryUtilisation;
  subject: UtilisationTrendSubject;
  onSubjectChange: (subject: UtilisationTrendSubject) => void;
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'code', desc: false }]);
  const data = useMemo(() => category.machines, [category.machines]);
  const table = useDataTable({
    columns,
    data,
    getRowId: (row) => row.machineId,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    onSortingChange: setSorting,
    state: { sorting },
  });
  const selected = subject.kind === 'category' && subject.id === category.categoryId;
  const selectedMachine = subject.kind === 'machine' ? subject.id : null;
  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader
          aria-current={selected ? 'true' : undefined}
          className={cn('flex flex-wrap items-center gap-3 rounded-t-xl', selected && 'bg-muted')}
        >
          <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-3 text-left">
            <IconChevronDown className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-180" />
            <CategoryLabel icon={category.icon} colour={category.colour} name={category.name} className="font-medium" />
            <span className="text-sm tabular-nums">{percent(category.utilisationPercent)}</span>
            <span className="text-sm text-muted-foreground">
              {formatNumber(category.activeMachineCount)} of {formatNumber(category.machineCount)} Machines
            </span>
          </CollapsibleTrigger>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSubjectChange({ kind: 'category', id: category.categoryId })}
          >
            Show trend
          </Button>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            <DataTable
              table={table}
              total={category.machines.length}
              paginationMode="complete"
              hideGlobalFilter
              hideFooter
              emptyMessage="No Machines in the fleet this period."
              getRowAriaLabel={(row) => `Show the trend for ${row.code}`}
              getRowState={(row) => (row.machineId === selectedMachine ? 'selected' : undefined)}
              getRowClassName={(row) => (row.machineId === selectedMachine ? 'bg-muted' : undefined)}
              onRowClick={(row) => onSubjectChange({ kind: 'machine', id: row.machineId })}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
