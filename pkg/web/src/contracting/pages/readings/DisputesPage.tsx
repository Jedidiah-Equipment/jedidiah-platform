import { formatHours } from '@pkg/domain';
import { assignmentAttentionLevelColorClassNames, readingRoleLabels, stintWindowLabel } from '@pkg/domain/contracting';
import type { ReadingDispute, ReadingStint } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { DisputeResolveDialog } from './DisputeResolveDialog.js';

/** The distinct stints a Dispute's readings bound, in ledger order. */
function disputeStints(dispute: ReadingDispute): ReadingStint[] {
  const stints = new Map<string, ReadingStint>();
  for (const { stint } of dispute.readings) if (stint) stints.set(stint.assignmentId, stint);
  return [...stints.values()];
}

const disputeJobNumbers = (dispute: ReadingDispute) => [
  ...new Set(disputeStints(dispute).map((stint) => stint.jobNumber)),
];

export function DisputesPage() {
  const trpc = useTRPC();
  // Tracked by id so the dialog follows the refreshed row, and closes once the Dispute resolves.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const query = useQuery(trpc.contractingReadings.listDisputes.queryOptions());
  const { amend } = useReadingReview();
  const selected = query.data?.find((dispute) => dispute.id === selectedId) ?? null;
  const columns = useMemo<DataTableColumnDef<ReadingDispute>[]>(
    () => [
      {
        id: 'machine',
        accessorFn: (dispute) => dispute.machineCode,
        header: 'Machine',
        cell: ({ row: { original: dispute } }) => (
          <CategoryLabel
            icon={dispute.categoryIcon}
            colour={dispute.categoryColour}
            name={dispute.machineCode}
            size={16}
          />
        ),
      },
      {
        id: 'jobs',
        accessorFn: (dispute) => disputeJobNumbers(dispute).join(' '),
        header: 'Job(s)',
        cell: ({ row }) => {
          const codes = disputeJobNumbers(row.original);
          return codes.length ? (
            <div className="flex flex-col gap-0.5">
              {codes.map((code) => (
                <Link
                  className="font-mono font-semibold whitespace-nowrap hover:underline"
                  key={code}
                  params={{ code }}
                  to="/contracting/jobs/$code"
                >
                  {code}
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'stintWindow',
        header: 'Stint window',
        cell: ({ row }) => {
          const stints = disputeStints(row.original);
          return stints.length ? (
            <div className="flex flex-col gap-0.5 whitespace-nowrap">
              {stints.map((stint) => (
                <span key={stint.assignmentId}>{stintWindowLabel(stint)}</span>
              ))}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'hours',
        header: 'Hours',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-x-1.5 whitespace-nowrap">
            {row.original.readings.map((reading, index) => (
              <span className="inline-flex items-center gap-1" key={reading.id}>
                {index > 0 ? <span aria-hidden>·</span> : null}
                {readingRoleLabels[reading.role]} {formatHours(reading.value)}
                {reading.disputed ? (
                  <IconAlertTriangle
                    aria-label="Disputed"
                    className={cn('size-4', assignmentAttentionLevelColorClassNames.critical.text)}
                    role="img"
                  />
                ) : null}
              </span>
            ))}
          </div>
        ),
      },
      {
        id: 'why',
        header: 'Why',
        cell: ({ row }) => <div className="max-w-xs">{row.original.reason}</div>,
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
        cell: ({ row }) => (
          <Button
            size="sm"
            onClick={() => {
              amend.reset();
              setSelectedId(row.original.id);
            }}
          >
            Resolve
          </Button>
        ),
      },
    ],
    [amend.reset],
  );
  const table = useDataTable({
    data: query.data ?? [],
    columns,
    getRowId: (dispute) => dispute.id,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });
  const close = () => setSelectedId(null);
  return (
    <>
      <PageLayout title="Disputes" description="Resolve Disputes by correcting hours or Read At.">
        <ErrorMessage error={query.error} fallbackMessage="Unable to load Disputes." />
        <DataTable
          table={table}
          paginationMode="incremental"
          total={query.data?.length ?? 0}
          isLoading={query.isPending}
          emptyMessage="No Disputes."
          globalFilterPlaceholder="Search machines and Jobs..."
        />
      </PageLayout>
      <DisputeResolveDialog
        dispute={selected}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        onResolve={(input) => amend.mutateAsync(input)}
        onResolved={close}
        error={amend.error}
      />
    </>
  );
}
