import { formatDate, toSentenceCase } from '@pkg/domain';
import {
  type ReadingExceptionType,
  readingExceptionTypeColorClassNames,
  readingExceptionTypeLabels,
} from '@pkg/domain/contracting';
import { ReadingAmendInput, type ReadingException } from '@pkg/schema/contracting';
import { IconEye, IconInfoCircle } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';
import { useTRPC } from '@/lib/trpc.js';

const amendmentValues = ReadingAmendInput.omit({ id: true });
const aiExceptionVerifications = new Set<ReadingException['aiVerification']>([
  'pending',
  'disagrees',
  'low-confidence',
]);

function exceptionTypes(row: ReadingException) {
  const types: ReadingExceptionType[] = [];
  if (row.disputed) types.push('disputed');
  if (row.evidenceReviewedAt === null && aiExceptionVerifications.has(row.aiVerification)) types.push('ai-flagged');
  return types;
}

function evidenceLabel(row: ReadingException) {
  if (!row.photo) return 'Missing Photo Evidence';
  if (row.aiVerification === 'low-confidence' && row.aiValue === null) return 'Photo-backed';
  const labels = {
    agrees: 'Entered value verified',
    pending: 'Verification pending',
    disagrees: 'Extracted value differs',
    'low-confidence': 'Low extraction confidence',
    'not-applicable': 'Photo verification not applicable',
  };
  return `Photo-backed · ${labels[row.aiVerification]}`;
}

function aiResult(row: ReadingException) {
  if (row.aiVerification === 'not-applicable') return 'No photo verification';
  if (row.aiVerification === 'pending') return 'Verification pending';
  if (row.aiValue === null) return 'No readable meter detected';
  return `${row.aiValue.toFixed(1)} h`;
}

function confidenceLabel(row: ReadingException) {
  if (row.aiConfidence === null) return 'Confidence unavailable';
  if (row.aiValue === null) return null;
  return `${Math.round(row.aiConfidence * 100)}% confidence in extracted value`;
}

function NoReadableMeterResult({ confidence }: { confidence: number }) {
  const label = `${Math.round(confidence * 100)}% confident no readable meter was detected`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            className="inline-flex cursor-help items-center gap-1 rounded-sm text-left text-foreground"
            aria-label={label}
          />
        }
      >
        <span>No readable meter detected</span>
        <IconInfoCircle aria-hidden className="size-[18px] shrink-0" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

async function fetchReadingPhoto(readingId: string, signal: AbortSignal) {
  const response = await fetch(readingPhotoUrl(readingId), { credentials: 'include', signal });
  if (!response.ok) throw new Error('Unable to preview meter photo.');
  return response.blob();
}

export function ReadingExceptionsPage() {
  const trpc = useTRPC();
  const { invalidateReadings } = useQueryInvalidation();
  const [selected, setSelected] = useState<ReadingException | null>(null);
  const [previewReading, setPreviewReading] = useState<ReadingException | null>(null);
  const [globalFilter, setGlobalFilter] = useState('');
  const query = useQuery(trpc.contractingReadings.listExceptions.queryOptions());
  const amend = useMutation(
    trpc.contractingReadings.amend.mutationOptions({
      onSuccess: async () => {
        await invalidateReadings();
        toast.success('Reading resolved');
      },
    }),
  );
  const reverify = useMutation(trpc.contractingReadings.reverify.mutationOptions({ onSuccess: invalidateReadings }));
  const fetchPreviewBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) => {
      if (!previewReading) throw new Error('No meter photo selected.');
      return fetchReadingPhoto(previewReading.id, signal);
    },
    [previewReading],
  );
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
        cell: ({ row }) => formatDate(row.original.capturedAt, 'dd MMM yyyy HH:mm'),
      },
      { accessorKey: 'role', header: 'Reading type', cell: ({ row }) => toSentenceCase(row.original.role) },
      {
        id: 'exceptionType',
        header: 'Exception type',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {exceptionTypes(row.original).map((type) => (
              <Badge
                key={type}
                className={`${readingExceptionTypeColorClassNames[type].chip} ${readingExceptionTypeColorClassNames[type].text}`}
                variant="outline"
              >
                {readingExceptionTypeLabels[type]}
              </Badge>
            ))}
          </div>
        ),
      },
      { accessorKey: 'value', header: 'Hours', cell: ({ row }) => row.original.value.toFixed(1) },
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
        cell: ({ row: { original: row } }) => (
          <div className="space-y-1">
            {row.photo ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-left text-foreground hover:underline"
                      aria-label={`Preview meter photo for ${row.machineCode}`}
                      onClick={() => setPreviewReading(row)}
                    />
                  }
                >
                  <span>{evidenceLabel(row)}</span>
                  <IconEye aria-hidden className="size-[18px] shrink-0" />
                </TooltipTrigger>
                <TooltipContent>Preview photo</TooltipContent>
              </Tooltip>
            ) : (
              <div>{evidenceLabel(row)}</div>
            )}
            {row.disputed ? <div>Disputed: {row.disputeReason}</div> : null}
            <div className="text-muted-foreground">{row.aiHint}</div>
          </div>
        ),
      },
      {
        id: 'ai',
        header: 'AI meter result',
        cell: ({ row }) => (
          <div>
            {row.original.aiValue === null && row.original.aiConfidence !== null ? (
              <NoReadableMeterResult confidence={row.original.aiConfidence} />
            ) : (
              <div>{aiResult(row.original)}</div>
            )}
            {confidenceLabel(row.original) ? <div>{confidenceLabel(row.original)}</div> : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                amend.reset();
                setSelected(row.original);
              }}
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!row.original.photo || reverify.isPending}
              onClick={() => reverify.mutate({ id: row.original.id })}
            >
              Re-verify
            </Button>
          </div>
        ),
      },
    ],
    [amend.reset, reverify.isPending, reverify.mutate],
  );
  const table = useDataTable({
    data: query.data ?? [],
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
  });
  return (
    <>
      <PageLayout
        title="Reading exceptions"
        description="Review disputed readings and photo verification warnings."
        size="full"
      >
        <ErrorMessage error={query.error ?? reverify.error} fallbackMessage="Unable to load or verify readings." />
        <DataTable
          table={table}
          paginationMode="incremental"
          total={query.data?.length ?? 0}
          isLoading={query.isPending}
          emptyMessage="No Reading Exceptions."
          globalFilterPlaceholder="Search machines..."
        />
      </PageLayout>
      <CreateEntityDialog
        key={selected?.id ?? 'closed'}
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title="Amend Hour Reading"
        description="Check the photo and both disputed readings. Confirm or correct the value and give a reason. This acknowledges the current evidence warning."
        submitLabel="Amend reading"
        defaultValues={{ value: selected?.value ?? 0, reason: '' }}
        validator={amendmentValues}
        onCreate={(values) => amend.mutateAsync(ReadingAmendInput.parse({ ...values, id: selected?.id }))}
        onCreated={() => setSelected(null)}
      >
        {(form) => (
          <>
            <ErrorMessage error={amend.error} fallbackMessage="Unable to amend reading." />
            <form.AppField name="value">{(field) => <field.NumberField label="Hours" />}</form.AppField>
            <form.AppField name="reason">{(field) => <field.TextareaField label="Amendment reason" />}</form.AppField>
          </>
        )}
      </CreateEntityDialog>
      <FilePreviewSheet
        description={previewReading ? `Captured ${formatDate(previewReading.capturedAt, 'dd MMM yyyy HH:mm')}` : ''}
        downloadFilename={`${previewReading?.machineCode ?? 'meter'}-reading.${previewReading?.photo?.contentType === 'image/png' ? 'png' : 'jpg'}`}
        fetchBlob={fetchPreviewBlob}
        kind="image"
        onOpenChange={(open) => {
          if (!open) setPreviewReading(null);
        }}
        open={previewReading !== null}
        queryKey={['contracting-reading-photo', previewReading?.id ?? 'closed']}
        staleTime={Infinity}
        subject="meter photo"
        title={previewReading ? `${previewReading.machineCode} meter photo` : 'Meter photo'}
      />
    </>
  );
}
