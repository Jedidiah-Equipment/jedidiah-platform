import { formatDate } from '@pkg/domain';
import { UUID } from '@pkg/schema';
import {
  type Assignment,
  GapResolveInput,
  type JobReading,
  Quantity,
  ReadingAmendInput,
  ReadingReason,
  ReadingValue,
  readingCaptureMultipartFields,
} from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { FilePreviewSheet } from '@/components/file-preview/FilePreviewSheet.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { ReadingEvidenceBadge, readingEvidence } from '@/contracting/components/ReadingEvidence.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { readingCapturePath, readingPhotoUrl } from '@/contracting/lib/contracting-http-paths.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { complementGap } from './types.js';

const PlanValues = z.object({
  machineId: requiredSelection(UUID, 'Choose a Machine'),
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(z.string()),
});

export function PlanMachineDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const machines = useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: open }));
  const implementOptions = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: open }));
  const drivers = useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: open }));
  const plan = useMutation(
    trpc.contractingJobs.stints.plan.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to plan Machine.'),
    }),
  );
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Plan machine"
      defaultValues={{ machineId: '', implementId: '', driverUserId: '' }}
      validator={PlanValues}
      onCreate={(values) =>
        plan.mutateAsync({
          jobId,
          machineId: values.machineId,
          implementId: values.implementId || null,
          driverUserId: values.driverUserId || null,
        })
      }
      onCreated={() => onOpenChange(false)}
    >
      {(form) => (
        <>
          <form.AppField name="machineId">
            {(field) => (
              <field.ComboboxField
                label="Machine"
                onValueSelect={(id) => !machines.data?.some((row) => row.id === id && row.onSiteJobNumber !== null)}
                options={(machines.data ?? []).map((row) => ({
                  value: row.id,
                  label: `${row.code} · ${row.make} ${row.model}${row.onSiteJobNumber ? ` · On Job ${row.onSiteJobNumber}` : ''}`,
                }))}
              />
            )}
          </form.AppField>
          <form.AppField name="implementId">
            {(field) => (
              <field.ComboboxField
                label="Implement"
                options={[
                  { value: '', label: 'None' },
                  ...(implementOptions.data ?? []).map((row) => ({ value: row.id, label: row.code })),
                ]}
              />
            )}
          </form.AppField>
          <form.AppField name="driverUserId">
            {(field) => (
              <field.ComboboxField
                label="Driver"
                placeholder="Machine's current driver"
                options={[
                  { value: '', label: "Machine's current driver" },
                  ...(drivers.data ?? []).map((row) => ({ value: row.id, label: row.name })),
                ]}
              />
            )}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

const GapValues = GapResolveInput.omit({ id: true });
export function GapResolveDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const resolve = useMutation(
    trpc.contractingJobs.stints.resolveGap.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to resolve Gap Flag.'),
    }),
  );
  const gapHours = stint?.gapHours ?? 0;
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`${gapHours.toFixed(1)} h gap on ${stint?.machineCode ?? 'Machine'}`}
      defaultValues={{ travelHours: gapHours, unaccountedHours: 0, reason: '' }}
      validator={GapValues}
      onCreate={(values) => resolve.mutateAsync({ id: stint?.id ?? '', ...values })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.Subscribe selector={(state) => state.values}>
            {(values) => (
              <>
                <label className="space-y-1" htmlFor="gap-travel-hours">
                  Travel Hours
                  <Input
                    id="gap-travel-hours"
                    type="number"
                    step="0.1"
                    min="0"
                    value={values.travelHours}
                    onChange={(event) => {
                      const split = complementGap(gapHours, Number(event.target.value));
                      form.setFieldValue('travelHours', split.travelHours);
                      form.setFieldValue('unaccountedHours', split.unaccountedHours);
                    }}
                  />
                </label>
                <label className="space-y-1" htmlFor="gap-unaccounted-hours">
                  Unaccounted Interval
                  <Input
                    id="gap-unaccounted-hours"
                    type="number"
                    step="0.1"
                    min="0"
                    value={values.unaccountedHours}
                    onChange={(event) => {
                      const split = complementGap(gapHours, gapHours - Number(event.target.value));
                      form.setFieldValue('travelHours', split.travelHours);
                      form.setFieldValue('unaccountedHours', split.unaccountedHours);
                    }}
                  />
                </label>
              </>
            )}
          </form.Subscribe>
          <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

const MeasureValues = z.object({ measureTypeId: requiredSelection(UUID, 'Choose a Measure Type'), quantity: Quantity });
export function AddMeasureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const types = useQuery(trpc.contractingRateCard.measureTypes.list.queryOptions(undefined, { enabled: !!stint }));
  const set = useMutation(
    trpc.contractingJobs.measures.set.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to set Measure.'),
    }),
  );
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={`Add measure · ${stint?.machineCode ?? ''}`}
      defaultValues={{ measureTypeId: '', quantity: 1 }}
      validator={MeasureValues}
      onCreate={(values) => set.mutateAsync({ assignmentId: stint?.id ?? '', ...values })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField name="measureTypeId">
            {(field) => (
              <field.SelectField
                label="Measure Type"
                options={(types.data ?? []).map((item) => ({
                  value: item.id,
                  label: `${item.name}${stint?.measures.some((measure) => measure.measureTypeId === item.id) ? ' (editing)' : ''}`,
                }))}
                onValueCommit={(id) =>
                  form.setFieldValue(
                    'quantity',
                    stint?.measures.find((measure) => measure.measureTypeId === id)?.quantity ?? 1,
                  )
                }
              />
            )}
          </form.AppField>
          <form.AppField name="quantity">
            {(field) => <field.NumberField label="Quantity" decimals={2} min={0.01} />}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

const DepartureValues = z.object({ value: ReadingValue, reason: ReadingReason });
export function DepartureCaptureDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const { invalidateJobs, invalidateReadings } = useQueryInvalidation();
  const [error, setError] = useState('');
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) {
          setError('');
          onClose();
        }
      }}
      title={`Enter departure reading · ${stint?.machineCode ?? ''}`}
      defaultValues={{ value: stint?.arrival?.value ?? 0, reason: '' }}
      validator={DepartureValues}
      onCreate={async (values) => {
        if (!stint) throw new Error('No Machine Assignment selected.');
        setError('');
        const body = new FormData();
        for (const [name, value] of readingCaptureMultipartFields({
          machineId: stint.machineId,
          assignmentId: stint.id,
          role: 'departure',
          value: values.value,
          capturedAt: new Date().toISOString(),
          comment: values.reason,
        }))
          body.append(name, value);
        const response = await fetch(readingCapturePath(), { method: 'POST', body, credentials: 'include' });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.message ?? 'Unable to capture departure reading.';
          setError(message);
          throw new Error(message);
        }
        await Promise.all([invalidateJobs(), invalidateReadings()]);
        toast.success('Departure reading captured');
        return true;
      }}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <p>Minimum allowed: {stint?.arrival?.value.toFixed(1) ?? '—'} h</p>
          <p className="text-muted-foreground">
            Typed by management without a photo. The reason is recorded on the reading.
          </p>
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          <form.AppField name="value">
            {(field) => <field.NumberField label="Hours" decimals={1} min={stint?.arrival?.value ?? 0} />}
          </form.AppField>
          <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}

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
                  <div className="text-2xl font-semibold">{reading.value.toFixed(1)} h</div>
                  <p>
                    Captured {formatDate(reading.capturedAt, 'dd MMM yyyy HH:mm')} by{' '}
                    {reading.capturedByName ?? 'Unknown'}
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
                      Amended {formatDate(reading.amendedAt, 'dd MMM yyyy HH:mm')}: {reading.amendmentReason}
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
        description={reading ? `Captured ${formatDate(reading.capturedAt, 'dd MMM yyyy HH:mm')}` : ''}
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
