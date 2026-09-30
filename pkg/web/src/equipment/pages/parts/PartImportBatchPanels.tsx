import { formatNumber } from '@pkg/domain';
import {
  PART_IMPORT_BATCH_OUTCOME_LABELS,
  type PartImportBatch,
  type PartImportBatchDetail,
  type PartImportBatchMember,
} from '@pkg/schema/equipment';
import { IconArrowLeft } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Alert, AlertDescription } from '@/components/ui/alert.js';
import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

/** What an import is called when it was sent without a file name. */
const PART_IMPORT_BATCH_FALLBACK_NAME = 'CSV import';
const UNAVAILABLE_IMPORTER = 'Unavailable user';

const PAGE_SIZE = 10;

function partImportBatchName(batch: Pick<PartImportBatch, 'fileName'>): string {
  return batch.fileName ?? PART_IMPORT_BATCH_FALLBACK_NAME;
}

const batchColumns: DataTableColumnDef<PartImportBatch>[] = [
  {
    accessorFn: partImportBatchName,
    cell: ({ row }) => <span className="font-medium">{partImportBatchName(row.original)}</span>,
    header: 'File',
    id: 'fileName',
  },
  {
    accessorKey: 'completedAt',
    cell: ({ row }) => <DateDisplay date={row.original.completedAt} format="medium" />,
    header: 'Imported',
  },
  {
    accessorFn: (batch) => batch.importedBy?.name ?? UNAVAILABLE_IMPORTER,
    header: 'By',
    id: 'importedBy',
  },
  {
    accessorKey: 'createdCount',
    cell: ({ row }) => formatNumber(row.original.createdCount),
    header: 'New',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
  {
    accessorKey: 'updatedCount',
    cell: ({ row }) => formatNumber(row.original.updatedCount),
    header: 'Updated',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
];

/** Recent Part Import Batches, newest first and shared across the team; choosing one opens it. */
export function PartImportBatchList({ onSelect }: { onSelect: (batchId: string) => void }) {
  const trpc = useTRPC();
  const batchesQuery = useInfiniteQuery(
    trpc.parts.importBatches.infiniteQueryOptions(
      { limit: PAGE_SIZE },
      { ...cursorInfiniteQueryOptions, placeholderData: keepPreviousData },
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(batchesQuery.data?.pages);
  const table = useDataTable({
    columns: batchColumns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (batch) => batch.id,
  });

  return (
    <DataTable
      emptyMessage="No Part imports yet."
      errorMessage={getApiQueryErrorMessage(batchesQuery.error, 'Unable to load recent imports.')}
      getRowAriaLabel={(batch) => `Open ${partImportBatchName(batch)}`}
      hideGlobalFilter
      maxHeightClassName="max-h-80"
      isLoading={batchesQuery.isPending}
      loadMore={{
        hasNextPage: batchesQuery.hasNextPage,
        isFetchingNextPage: batchesQuery.isFetchingNextPage,
        loadedCount: items.length,
        onLoadMore: () => void batchesQuery.fetchNextPage(),
      }}
      onRowClick={(batch) => onSelect(batch.id)}
      paginationMode="cursor"
      table={table}
      total={total}
      totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'import' : 'imports'}`}
    />
  );
}

const memberColumns: DataTableColumnDef<PartImportBatchMember>[] = [
  {
    accessorKey: 'lineNumber',
    cell: ({ row }) => formatNumber(row.original.lineNumber),
    header: 'Line',
    meta: { cellClassName: 'tabular-nums' },
  },
  {
    accessorFn: (member) => (member.part ? `${member.part.code} ${member.part.name}` : ''),
    cell: ({ row }) => <MemberPart member={row.original} />,
    header: 'Part',
    id: 'part',
  },
  {
    accessorFn: (member) => member.part?.storageLocation ?? '',
    header: 'Location',
    id: 'storageLocation',
  },
  {
    accessorFn: (member) => PART_IMPORT_BATCH_OUTCOME_LABELS[member.outcome],
    header: 'Outcome',
    id: 'outcome',
  },
];

function MemberPart({ member }: { member: PartImportBatchMember }) {
  if (!member.part) {
    return (
      <span className="text-muted-foreground">
        {member.importedCode} · no longer in the catalog, so it gets no label
      </span>
    );
  }

  const changed = member.part.code !== member.importedCode || member.part.name !== member.importedName;
  return (
    <span>
      <span className="font-medium">{member.part.code}</span> · {member.part.name}
      {changed ? (
        <span className="block text-xs text-muted-foreground">
          Imported as {member.importedCode} · {member.importedName}
        </span>
      ) : null}
    </span>
  );
}

type PartImportBatchViewProps = {
  detail: PartImportBatchDetail | undefined;
  errorMessage: string | undefined;
  includeUpdated: boolean;
  isLoading: boolean;
  onBack: () => void;
  onIncludeUpdatedChange: (includeUpdated: boolean) => void;
};

/** One batch's Parts as they stand now, and how many labels the current choice prints. */
export function PartImportBatchView({
  detail,
  errorMessage,
  includeUpdated,
  isLoading,
  onBack,
  onIncludeUpdatedChange,
}: PartImportBatchViewProps) {
  const members = detail?.members ?? [];
  const table = useDataTable({
    columns: memberColumns,
    data: members,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (member) => String(member.lineNumber),
  });
  const labelCount = detail ? printableLabelCount(detail, includeUpdated) : 0;

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={onBack} size="sm" type="button" variant="ghost">
          <IconArrowLeft data-icon="inline-start" />
          Recent imports
        </Button>
        {detail ? (
          <span className="text-sm text-muted-foreground">
            {partImportBatchName(detail.batch)} · <DateDisplay date={detail.batch.completedAt} format="medium" /> ·{' '}
            {detail.batch.importedBy?.name ?? UNAVAILABLE_IMPORTER}
          </span>
        ) : null}
      </div>
      <DataTable
        emptyMessage="No Parts were added or updated by this import."
        errorMessage={errorMessage}
        hideGlobalFilter
        maxHeightClassName="max-h-80"
        isLoading={isLoading}
        paginationMode="incremental"
        table={table}
        total={members.length}
        totalLabel={(value) => `${formatNumber(value)} imported ${value === 1 ? 'row' : 'rows'}`}
      />
      <Field orientation="horizontal">
        <Checkbox
          checked={includeUpdated}
          id="part-label-include-updated"
          onCheckedChange={(checked) => onIncludeUpdatedChange(checked === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor="part-label-include-updated">Include updated Parts</FieldLabel>
          <FieldDescription>By default only the Parts this import added get a label.</FieldDescription>
        </FieldContent>
      </Field>
      {detail ? (
        <Alert>
          <AlertDescription>
            {labelCount > 0
              ? `${formatNumber(labelCount)} ${labelCount === 1 ? 'label' : 'labels'} to print, one per Part, with each Part's current details.`
              : emptySelectionMessage(detail, includeUpdated)}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** Why a selection prints nothing: the import added nothing to label, or what it added has since gone. */
function emptySelectionMessage(detail: PartImportBatchDetail, includeUpdated: boolean): string {
  const selected = detail.members.some(
    (member) => member.outcome === 'created' || (includeUpdated && member.outcome === 'updated'),
  );
  if (selected) return 'Nothing to print: the Parts in this selection are no longer in the catalog.';

  if (includeUpdated) return 'Nothing to print: this import added and updated no Parts.';

  return detail.members.some((member) => member.outcome === 'updated')
    ? 'Nothing to print: this import added no new Parts. Tick Include updated Parts to label the ones it changed.'
    : 'Nothing to print: this import added no new Parts.';
}

export function printableLabelCount(detail: PartImportBatchDetail, includeUpdated: boolean): number {
  return includeUpdated ? detail.labelCounts.createdAndUpdated : detail.labelCounts.created;
}
