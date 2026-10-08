import { formatNumber } from '@pkg/domain';
import type { TranscriptionHintStatus, TranscriptionReviewItem } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { LabelledText, TextChange } from './TextChange.js';

const PAGE_SIZE = 25;

const hintStatusLabels = {
  not_saved: 'Not saved yet',
  no_correction: 'No correction',
  not_english: 'Not English, so skipped',
  pending: 'Pending',
  hint_added: 'Hint added',
  no_hint: 'No hint',
  unknown: 'Derived before outcomes were kept',
} as const satisfies Record<TranscriptionHintStatus['kind'], string>;

function HintStatus({ status }: { status: TranscriptionHintStatus }) {
  return (
    <div className="grid min-w-36 gap-1">
      <Badge variant={status.kind === 'hint_added' ? 'default' : 'outline'}>{hintStatusLabels[status.kind]}</Badge>
      {status.kind === 'hint_added' ? (
        <Link
          className="text-sm underline underline-offset-2"
          to="/contracting/transcriptions"
          search={{ tab: 'hints', hint: status.hintId }}
        >
          View the hint
        </Link>
      ) : null}
      {status.kind === 'no_hint' && status.reason ? (
        <span className="text-sm text-muted-foreground">{status.reason}</span>
      ) : null}
    </div>
  );
}

/** Every user's Transcriptions, newest first: heard, shown, kept, and where the hint derivation stands. */
export function TranscriptionTable() {
  const trpc = useTRPC();
  const query = useInfiniteQuery(
    trpc.contractingTranscriptions.list.infiniteQueryOptions(
      { limit: PAGE_SIZE },
      { ...cursorInfiniteQueryOptions, placeholderData: keepPreviousData },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(query.data?.pages);
  const columns = useMemo<DataTableColumnDef<TranscriptionReviewItem>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        cell: ({ row }) => (
          <div className="grid min-w-32 gap-0.5">
            <DateDisplay date={row.original.createdAt} format="medium" />
            <span className="text-sm text-muted-foreground">{row.original.createdByName}</span>
          </div>
        ),
      },
      {
        accessorKey: 'purpose',
        header: 'Purpose',
        cell: ({ row }) => (
          <div className="grid min-w-28 gap-0.5">
            <span>{row.original.purpose}</span>
            <span className="text-sm text-muted-foreground">{row.original.language ?? 'Language unknown'}</span>
          </div>
        ),
      },
      {
        id: 'text',
        header: 'Heard → shown → kept',
        cell: ({ row }) => {
          const { rawText, shownText, savedText } = row.original;
          return (
            <div className="grid min-w-96 max-w-3xl gap-2">
              <LabelledText label="Heard">{rawText}</LabelledText>
              <LabelledText label="Shown">{shownText}</LabelledText>
              <LabelledText label="Kept">
                {savedText === null ? '—' : <TextChange shown={shownText} saved={savedText} />}
              </LabelledText>
            </div>
          );
        },
      },
      {
        id: 'hint',
        header: 'Hint',
        cell: ({ row }) => <HintStatus status={row.original.hintStatus} />,
      },
    ],
    [],
  );
  const table = useDataTable({ columns, data: items, enableSorting: false, enableColumnFilters: false });
  return (
    <DataTable
      emptyMessage="No Voice Notes yet."
      errorMessage={getApiQueryErrorMessage(query.error, 'Unable to load Transcriptions.')}
      hideGlobalFilter
      isLoading={query.isPending}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        loadedCount: items.length,
        onLoadMore: () => void query.fetchNextPage(),
      }}
      table={table}
      total={total}
      totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'Transcription' : 'Transcriptions'}`}
    />
  );
}
