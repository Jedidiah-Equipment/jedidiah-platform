import { formatHours } from '@pkg/domain';
import { assignmentAttentionLevelColorClassNames, readingRoleLabels, stintWindowLabel } from '@pkg/domain/contracting';
import type { ReadingException, ReadingExceptionRow, ReadingStint } from '@pkg/schema/contracting';
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
import { NoReadableMeterResult, readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';
import { ReadingDialog } from '@/contracting/pages/jobs/ReadingDialog.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { DisputeResolveDialog } from './DisputeResolveDialog.js';

const rowId = (row: ReadingExceptionRow) => (row.kind === 'dispute' ? row.dispute.id : row.reading.id);
const rowMachine = (row: ReadingExceptionRow) => (row.kind === 'dispute' ? row.dispute : row.reading);
const rowReadings = (row: ReadingExceptionRow) => (row.kind === 'dispute' ? row.dispute.readings : [row.reading]);

/** The distinct stints a row's readings bound, in ledger order. */
function rowStints(row: ReadingExceptionRow): NonNullable<ReadingStint>[] {
  const stints = new Map<string, NonNullable<ReadingStint>>();
  for (const { stint } of rowReadings(row)) if (stint) stints.set(stint.assignmentId, stint);
  return [...stints.values()];
}

const rowJobCodes = (row: ReadingExceptionRow) => [...new Set(rowStints(row).map((stint) => stint.jobCode))];

function AiFinding({ reading }: { reading: ReadingException }) {
  const evidence = readingEvidence(reading);
  return (
    <div className="space-y-0.5">
      {evidence.resultConfidencePercent !== null ? (
        <NoReadableMeterResult confidencePercent={evidence.resultConfidencePercent} />
      ) : (
        <div>AI read {evidence.resultLabel}</div>
      )}
      {evidence.confidenceLabel ? <div className="text-muted-foreground">{evidence.confidenceLabel}</div> : null}
      {reading.aiHint ? <div className="text-muted-foreground">{reading.aiHint}</div> : null}
    </div>
  );
}

export function ReadingExceptionsPage() {
  const trpc = useTRPC();
  // Tracked by id so the dialogs follow the refreshed row, and close once the row resolves.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const query = useQuery(trpc.contractingReadings.listExceptions.queryOptions());
  const { amend } = useReadingReview();
  const selected = query.data?.find((row) => rowId(row) === selectedId) ?? null;
  const columns = useMemo<DataTableColumnDef<ReadingExceptionRow>[]>(
    () => [
      {
        id: 'machine',
        accessorFn: (row) => rowMachine(row).machineCode,
        header: 'Machine',
        cell: ({ row }) => {
          const machine = rowMachine(row.original);
          return (
            <CategoryLabel
              icon={machine.categoryIcon}
              colour={machine.categoryColour}
              name={machine.machineCode}
              size={16}
            />
          );
        },
      },
      {
        id: 'jobs',
        accessorFn: (row) => rowJobCodes(row).join(' '),
        header: 'Job(s)',
        cell: ({ row }) => {
          const codes = rowJobCodes(row.original);
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
          const stints = rowStints(row.original);
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
            {rowReadings(row.original).map((reading, index) => (
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
        cell: ({ row: { original: row } }) =>
          row.kind === 'dispute' ? (
            <div className="max-w-xs">{row.dispute.reason}</div>
          ) : (
            <AiFinding reading={row.reading} />
          ),
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
              setSelectedId(rowId(row.original));
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
    getRowId: rowId,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });
  const close = () => setSelectedId(null);
  return (
    <>
      <PageLayout
        title="Reading exceptions"
        description="Resolve Disputes by correcting hours or Read At, and review photo verification warnings."
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load Reading Exceptions." />
        <DataTable
          table={table}
          paginationMode="incremental"
          total={query.data?.length ?? 0}
          isLoading={query.isPending}
          emptyMessage="No Reading Exceptions."
          globalFilterPlaceholder="Search machines and Jobs..."
        />
      </PageLayout>
      <DisputeResolveDialog
        dispute={selected?.kind === 'dispute' ? selected.dispute : null}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        onResolve={(input) => amend.mutateAsync(input)}
        onResolved={close}
        error={amend.error}
      />
      <ReadingDialog
        selected={selected?.kind === 'ai-flagged' ? { reading: selected.reading, machine: selected.reading } : null}
        onClose={close}
        // The route admits only those who may amend readings.
        amendReadings
        amendDescription="Check the photo. Confirm or correct the value and Read At, and give a reason. This acknowledges the current evidence warning."
      />
    </>
  );
}
