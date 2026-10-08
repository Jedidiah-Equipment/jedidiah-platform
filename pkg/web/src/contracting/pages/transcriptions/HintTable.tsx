import { formatNumber } from '@pkg/domain';
import type { TranscriptionHintRow } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { TranscriptionTexts } from './TranscriptionTexts.js';

/** Every Transcription Hint, those in force first, each beside the correction it was learned from. */
export function HintTable({
  selectedHintId,
  fromTranscriptionId,
}: {
  selectedHintId: string | undefined;
  fromTranscriptionId: string | undefined;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingTranscriptions.hints.queryOptions());
  const hints = query.data?.hints ?? [];
  const container = useRef<HTMLDivElement>(null);
  const isSelected = (hint: TranscriptionHintRow) =>
    hint.id === selectedHintId || (fromTranscriptionId !== undefined && hint.source?.id === fromTranscriptionId);
  // The hints opened from their Transcription may sit far down the list.
  useEffect(() => {
    if ((selectedHintId || fromTranscriptionId) && query.data)
      container.current?.querySelector('[data-state="selected"]')?.scrollIntoView({ block: 'center' });
  }, [selectedHintId, fromTranscriptionId, query.data]);
  const columns = useMemo<DataTableColumnDef<TranscriptionHintRow>[]>(
    () => [
      {
        accessorKey: 'rule',
        header: 'Rule',
        cell: ({ row }) => (
          <div className="grid min-w-64 max-w-md gap-1">
            <span>{row.original.rule}</span>
            {row.original.keyterm ? (
              <span className="text-sm text-muted-foreground">Keyterm: {row.original.keyterm}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const { createdAt, retiredAt, supersededBy } = row.original;
          return (
            <div className="grid min-w-40 gap-1 text-sm">
              <Badge variant={retiredAt ? 'outline' : 'default'}>{retiredAt ? 'Retired' : 'In force'}</Badge>
              <span className="text-muted-foreground">
                Added <DateDisplay date={createdAt} format="medium" />
              </span>
              {retiredAt ? (
                <span className="text-muted-foreground">
                  Retired <DateDisplay date={retiredAt} format="medium" />
                </span>
              ) : null}
              {supersededBy ? (
                <Link
                  className="underline underline-offset-2"
                  to="/contracting/transcriptions"
                  search={{ tab: 'hints', hint: supersededBy.id }}
                >
                  Replaced by: {supersededBy.rule}
                </Link>
              ) : null}
            </div>
          );
        },
      },
      {
        id: 'source',
        header: 'Learned from',
        cell: ({ row }) => {
          const { source } = row.original;
          if (!source) return <span className="text-sm text-muted-foreground">No source Transcription</span>;
          return <TranscriptionTexts {...source} />;
        },
      },
    ],
    [],
  );
  const table = useDataTable({
    columns,
    data: hints,
    enableSorting: false,
    enableColumnFilters: false,
    getRowId: (hint) => hint.id,
  });
  return (
    <div ref={container} className="grid gap-3">
      {query.data ? (
        <p className="text-sm text-muted-foreground">
          {formatNumber(query.data.activeCount)} of {formatNumber(query.data.cap)} hints in force.
        </p>
      ) : null}
      <DataTable
        emptyMessage="No hints learned yet."
        errorMessage={getApiQueryErrorMessage(query.error, 'Unable to load hints.')}
        getRowState={(hint) => (isSelected(hint) ? 'selected' : undefined)}
        hideGlobalFilter
        isLoading={query.isPending}
        paginationMode="complete"
        table={table}
        total={hints.length}
        totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'hint' : 'hints'}`}
      />
    </div>
  );
}
