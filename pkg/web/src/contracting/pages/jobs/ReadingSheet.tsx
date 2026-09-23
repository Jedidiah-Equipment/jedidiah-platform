import { formatDate, formatHours } from '@pkg/domain';
import { type Assignment, type JobReading, ReadingAmendInput } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { ReadingEvidenceBadge, readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const AmendValues = ReadingAmendInput.omit({ id: true });
export function ReadingSheet({
  selected,
  onClose,
  amendReadings,
}: {
  selected: { reading: JobReading; stint: Assignment } | null;
  onClose: () => void;
  amendReadings: boolean;
}) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [amending, setAmending] = useState(false);
  const [preview, setPreview] = useState(false);
  const amend = useMutation(
    trpc.contractingReadings.amend.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateJobs(), invalidateReadings()]);
        toast.success('Reading amended');
      },
      onError: (error) => showError(error, 'Unable to amend reading.'),
    }),
  );
  const reverify = useMutation(
    trpc.contractingReadings.reverify.mutationOptions({
      onSuccess: async () => {
        await Promise.all([invalidateJobs(), invalidateReadings()]);
      },
      onError: (error) => showError(error, 'Unable to re-verify reading.'),
    }),
  );
  const fetchBlob = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      if (!selected) throw new Error('No reading selected.');
      const response = await fetch(readingPhotoUrl(selected.reading.id), { signal, credentials: 'include' });
      if (!response.ok) throw new Error('Unable to preview meter photo.');
      return response.blob();
    },
    [selected],
  );
  const reading = selected?.reading;
  const evidence = reading ? readingEvidence(reading) : null;
  return (
    <>
      <Sheet
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              {selected?.stint.machineCode ?? 'Reading'} · {reading?.role ?? ''}
            </SheetTitle>
            <SheetDescription>Hours and gaps recompute from the amended value.</SheetDescription>
          </SheetHeader>
          <ScrollArea className="px-4">
            <div className="space-y-4 pb-6">
              {reading ? (
                <>
                  <div className="text-2xl font-semibold">{formatHours(reading.value)}</div>
                  <p>
                    Captured {formatDate(reading.capturedAt, 'medium')} by {reading.capturedByName ?? 'Unknown'}
                  </p>
                  <ReadingEvidenceBadge
                    reading={reading}
                    onPreview={reading.photoBacked ? () => setPreview(true) : undefined}
                  />
                  {reading.photoBacked ? (
                    <Button variant="outline" onClick={() => setPreview(true)}>
                      View meter photo
                    </Button>
                  ) : (
                    <p>Missing Photo Evidence</p>
                  )}
                  <p>
                    {evidence?.resultLabel} · {evidence?.confidenceLabel}
                  </p>
                  {reading.comment ? <p>Capture comment: {reading.comment}</p> : null}
                  {reading.disputed ? <p>Disputed: {reading.disputeReason}</p> : null}
                  {reading.amendedAt ? (
                    <p>
                      Amended {formatDate(reading.amendedAt, 'medium')}: {reading.amendmentReason}
                    </p>
                  ) : null}
                  <ErrorMessage error={reverify.error} fallbackMessage="Unable to re-verify reading." />
                  <div className="flex gap-2">
                    {amendReadings ? <Button onClick={() => setAmending(true)}>Amend reading</Button> : null}
                    {amendReadings && reading.photoBacked ? (
                      <Button
                        variant="outline"
                        disabled={reverify.isPending}
                        onClick={() => reverify.mutate({ id: reading.id })}
                      >
                        Re-verify
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <CreateEntityDialog
        key={reading?.id ?? 'closed'}
        open={amending && !!reading}
        onOpenChange={setAmending}
        title="Amend reading"
        description="Hours and gaps recompute from the amended value."
        defaultValues={{ value: reading?.value ?? 0, reason: '' }}
        validator={AmendValues}
        onCreate={(values) => amend.mutateAsync({ id: reading?.id ?? '', ...values })}
        onCreated={() => setAmending(false)}
      >
        {(form) => (
          <>
            <form.AppField name="value">{(field) => <field.NumberField label="Hours" decimals={1} />}</form.AppField>
            <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
          </>
        )}
      </CreateEntityDialog>
      <FilePreviewSheet
        open={preview && !!reading}
        onOpenChange={setPreview}
        description={reading ? `Captured ${formatDate(reading.capturedAt, 'medium')}` : ''}
        downloadFilename={`${selected?.stint.machineCode ?? 'meter'}-reading.jpg`}
        fetchBlob={fetchBlob}
        kind="image"
        queryKey={['contracting-reading-photo', reading?.id ?? 'closed']}
        staleTime={Infinity}
        subject="meter photo"
        title={`${selected?.stint.machineCode ?? 'Machine'} meter photo`}
      />
    </>
  );
}
