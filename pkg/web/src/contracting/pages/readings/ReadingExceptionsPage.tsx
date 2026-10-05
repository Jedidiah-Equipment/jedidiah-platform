import { formatDate, formatHours, toSentenceCase } from '@pkg/domain';
import {
  assignmentAttentionLevelColorClassNames,
  readingExceptionTypeLabels,
  readingExceptionTypeLevels,
} from '@pkg/domain/contracting';
import type { ReadingException } from '@pkg/schema/contracting';
import { IconEye } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { MeterPhotoPreview } from '@/contracting/components/MeterPhotoPreview.js';
import { NoReadableMeterResult, readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useReadingReview } from '@/contracting/hooks/use-reading-review.js';
import { ReadingDialog } from '@/contracting/pages/jobs/ReadingDialog.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

export function ReadingExceptionsPage() {
  const trpc = useTRPC();
  // Tracked by id so the dialog follows the refreshed row, and closes once an amendment resolves the exception.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewReading, setPreviewReading] = useState<ReadingException | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const query = useQuery(trpc.contractingReadings.listExceptions.queryOptions());
  const { reverify } = useReadingReview();
  const selected = query.data?.find((row) => row.id === selectedId) ?? null;
  const showError = useApiMutationErrorToast();
  const columns = useMemo<DataTableColumnDef<ReadingException>[]>(
    () => [
      {
        accessorKey: 'machineCode',
        header: 'Machine',
        cell: ({ row }) => (
          <CategoryLabel
            icon={row.original.categoryIcon}
            colour={row.original.categoryColour}
            name={row.original.machineCode}
            size={16}
          />
        ),
      },
      {
        id: 'capture',
        header: 'Capture',
        cell: ({ row }) => formatDate(row.original.capturedAt, 'medium'),
      },
      { accessorKey: 'role', header: 'Reading type', cell: ({ row }) => toSentenceCase(row.original.role) },
      {
        id: 'exceptionType',
        header: 'Exception type',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.exceptionTypes.map((type) => (
              <Badge
                key={type}
                className={cn(
                  assignmentAttentionLevelColorClassNames[readingExceptionTypeLevels[type]].chip,
                  assignmentAttentionLevelColorClassNames[readingExceptionTypeLevels[type]].text,
                )}
                variant="outline"
              >
                {readingExceptionTypeLabels[type]}
              </Badge>
            ))}
          </div>
        ),
      },
      { accessorKey: 'value', header: 'Hours', cell: ({ row }) => formatHours(row.original.value) },
      {
        accessorKey: 'comment',
        header: 'Capture comment',
        cell: ({ row }) =>
          row.original.comment ? (
            <div className="max-w-xs whitespace-pre-wrap font-medium">{row.original.comment}</div>
          ) : (
            <span className="text-muted-foreground">No comment</span>
          ),
      },
      {
        id: 'evidence',
        header: 'Evidence',
        cell: ({ row: { original: row } }) => {
          const presentation = readingEvidence(row);
          return (
            <div className="space-y-1">
              {row.photo ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-left text-foreground hover:underline"
                        onClick={() => setPreviewReading(row)}
                      />
                    }
                  >
                    <span>{presentation.evidenceLabel}</span>
                    <IconEye aria-hidden className="size-[18px] shrink-0" />
                    <span className="sr-only">. Preview meter photo for {row.machineCode}</span>
                  </TooltipTrigger>
                  <TooltipContent>Preview photo</TooltipContent>
                </Tooltip>
              ) : (
                <div>{presentation.evidenceLabel}</div>
              )}
              {row.disputed ? <div>Disputed: {row.disputeReason}</div> : null}
              <div className="text-muted-foreground">{row.aiHint}</div>
            </div>
          );
        },
      },
      {
        id: 'ai',
        header: 'AI meter result',
        cell: ({ row }) => {
          const presentation = readingEvidence(row.original);
          return (
            <div>
              {presentation.resultConfidencePercent !== null ? (
                <NoReadableMeterResult confidencePercent={presentation.resultConfidencePercent} />
              ) : (
                <div>{presentation.resultLabel}</div>
              )}
              {presentation.confidenceLabel ? <div>{presentation.confidenceLabel}</div> : null}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { cellClassName: 'text-right', headerClassName: 'text-right' },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!row.original.photo || reverify.isPending}
              onClick={() =>
                reverify.mutate(
                  { id: row.original.id },
                  { onError: (error) => showError(error, 'Unable to re-verify reading.') },
                )
              }
            >
              Re-verify
            </Button>
            <Button size="sm" onClick={() => setSelectedId(row.original.id)}>
              Resolve
            </Button>
          </div>
        ),
      },
    ],
    [reverify.isPending, reverify.mutate, showError],
  );
  const table = useDataTable({
    data: query.data ?? [],
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });
  return (
    <>
      <PageLayout title="Reading exceptions" description="Review disputed readings and photo verification warnings.">
        <ErrorMessage error={query.error} fallbackMessage="Unable to load Reading Exceptions." />
        <DataTable
          table={table}
          paginationMode="incremental"
          total={query.data?.length ?? 0}
          isLoading={query.isPending}
          emptyMessage="No Reading Exceptions."
          globalFilterPlaceholder="Search machines..."
        />
      </PageLayout>
      <ReadingDialog
        selected={selected ? { reading: selected, machine: selected } : null}
        onClose={() => setSelectedId(null)}
        // The route admits only those who may amend readings.
        amendReadings
        amendDescription="Check the photo and both disputed readings. Confirm or correct the value and give a reason. This acknowledges the current evidence warning."
      />
      <MeterPhotoPreview
        photo={previewReading ? { readingId: previewReading.id, machineCode: previewReading.machineCode } : null}
        description={previewReading ? `Captured ${formatDate(previewReading.capturedAt, 'medium')}` : ''}
        onClose={() => setPreviewReading(null)}
      />
    </>
  );
}
