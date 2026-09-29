import { formatHours } from '@pkg/domain';
import { type Assignment, ReadingComment, ReadingValue, readingCaptureMultipartFields } from '@pkg/schema/contracting';
import { IconArrowRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingCapturePath } from '@/contracting/lib/contracting-http-paths.js';
import { useTRPC } from '@/lib/trpc.js';
import { ReadingPhotoPicker } from './ReadingPhotoPicker.js';

const ArrivalValues = z.object({
  value: ReadingValue,
  comment: z.union([z.literal(''), ReadingComment]),
  disputePrevious: z.boolean(),
});

export function ArrivalCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [readingFocused, setReadingFocused] = useState(false);
  const history = useQuery(
    trpc.contractingReadings.fieldHistory.queryOptions({ machineId: stint?.machineId ?? '' }, { enabled: !!stint }),
  );
  const latest = history.data?.[0];
  const canCapture = (values: z.infer<typeof ArrivalValues>) =>
    history.isSuccess && (!latest || values.value >= latest.value || values.disputePrevious);

  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          setPhoto(null);
          setReadingFocused(false);
          onClose();
        }
      }}
      title={`Capture arrival · ${stint?.machineCode ?? ''}`}
      contentClassName="sm:max-w-md"
      defaultValues={{ value: Number.NaN, comment: '', disputePrevious: false }}
      validator={ArrivalValues}
      canSubmit={canCapture}
      disableSubmitWhenInvalid
      onBeforeCreate={canCapture}
      onCreate={async (values) => {
        if (!stint) throw new Error('No Machine Assignment selected.');
        setError('');
        const body = new FormData();
        for (const [name, value] of readingCaptureMultipartFields({
          machineId: stint.machineId,
          assignmentId: stint.id,
          role: 'arrival',
          value: values.value,
          capturedAt: new Date().toISOString(),
          comment: values.comment.trim() || null,
          disputePrevious: !!latest && values.value < latest.value && values.disputePrevious,
          expectedPreviousId: latest?.id ?? null,
        }))
          body.append(name, value);
        if (photo) body.append('photo', photo, photo.name);
        const response = await fetch(readingCapturePath(), { method: 'POST', body, credentials: 'include' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.message ?? 'Unable to capture arrival reading.';
          setError(message);
          throw new Error(message);
        }
        await Promise.all([invalidateJobs(), invalidateReadings()]);
        toast.success('Arrival reading captured');
        return true;
      }}
      onCreated={() => {
        setPhoto(null);
        setReadingFocused(false);
        onClose();
      }}
    >
      {(form) => (
        <>
          <ErrorMessage error={history.error} fallbackMessage="Unable to load the Machine's previous reading." />
          {history.isPending ? <p className="text-muted-foreground">Loading the previous reading…</p> : null}
          <div className="mt-2 space-y-3">
            <div className="grid grid-cols-[minmax(6rem,0.85fr)_1.25rem_minmax(0,1.3fr)] items-end gap-2">
              <div className="min-w-0 space-y-2">
                <span className="block text-xs font-medium">Previous reading</span>
                <span className="flex h-8 items-center text-lg font-semibold">
                  {history.isSuccess ? (latest ? formatHours(latest.value) : 'None') : '—'}
                </span>
              </div>
              <IconArrowRight aria-hidden="true" className="mb-1.5 size-5 text-muted-foreground" />
              <div onFocusCapture={() => setReadingFocused(true)} onBlurCapture={() => setReadingFocused(false)}>
                <form.AppField name="value">
                  {(field) => (
                    <field.NumberField
                      label={<span className="text-xs">Current reading</span>}
                      decimals={1}
                      min={0}
                      className="text-lg font-semibold md:text-lg"
                    />
                  )}
                </form.AppField>
              </div>
            </div>
            <form.Subscribe selector={(state) => state.values.value}>
              {(value) =>
                !readingFocused && latest && value < latest.value ? (
                  <div className="rounded-lg border border-warning/45 bg-warning/10 p-3">
                    <form.AppField name="disputePrevious">
                      {(field) => (
                        <field.CheckboxField
                          label="The previous reading is wrong"
                          description={`Record ${formatHours(value)} and dispute the ${formatHours(latest.value)} reading.`}
                        />
                      )}
                    </form.AppField>
                  </div>
                ) : null
              }
            </form.Subscribe>
          </div>
          <ReadingPhotoPicker
            id={`arrival-photo-${stint?.id ?? 'closed'}`}
            photo={photo}
            onChange={setPhoto}
            onError={setError}
          />
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <form.AppField name="comment">{(field) => <field.TextareaField label="Comment (optional)" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
