import { canComplete, suggestJobDates } from '@pkg/domain/contracting';
import { DateOnlyIso } from '@pkg/schema';
import { JobCompleteInput, type JobDetail, JobPatchInput, Litres } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveStatus, useAppForm, useAutosaveForm } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { type jobCapabilities, plannedNeverArrived, SignOffValues, toCompleteInput } from './types.js';

type Capabilities = ReturnType<typeof jobCapabilities>;

export function SignOffCard({ job, capabilities }: { job: JobDetail; capabilities: Capabilities }) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const planned = plannedNeverArrived(job.assignments);
  const remove = useMutation(
    trpc.contractingJobs.stints.remove.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to remove planned Machine.'),
    }),
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Sign-off <HelpLink label="How to sign off a Job" topic="contractingJobSignOff" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {job.status === 'active' ? (
          <DraftSignOffDetails job={job} capabilities={capabilities} plannedIds={planned.map((stint) => stint.id)} />
        ) : (
          <SavedSignOffDetails
            job={job}
            editable={capabilities.editSignOffDetails}
            dieselEditable={capabilities.editDieselLitres}
          />
        )}
        {job.status === 'active' && planned.length ? (
          <section className="space-y-2">
            <h3 className="font-medium">Planned, never arrived</h3>
            <p className="text-muted-foreground">These machines never arrived. Complete removes any still listed.</p>
            {planned.map((stint) => (
              <div key={stint.id} className="flex items-center justify-between rounded border p-2 opacity-60">
                <span>
                  {stint.machineCode} · {stint.implementCode ?? 'No Implement'}
                </span>
                {capabilities.planStints ? (
                  <RemoveEntityButton
                    title="Remove planned Machine"
                    description="Remove this Machine Assignment?"
                    triggerIconOnly
                    triggerLabel={`Remove ${stint.machineCode}`}
                    triggerSize="icon-sm"
                    isPending={remove.isPending}
                    onConfirm={() => remove.mutate({ id: stint.id })}
                  />
                ) : null}
              </div>
            ))}
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DraftSignOffDetails({
  job,
  capabilities,
  plannedIds,
}: {
  job: JobDetail;
  capabilities: Capabilities;
  plannedIds: string[];
}) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const [confirm, setConfirm] = useState(false);
  const [startEdited, setStartEdited] = useState(false);
  const [endEdited, setEndEdited] = useState(false);
  const suggestions = useMemo(
    () => suggestJobDates(job.assignments.map((stint) => ({ ...stint, previousDeparture: null, gap: null }))),
    [job.assignments],
  );
  const form = useAppForm({
    defaultValues: {
      startDate: suggestions.startDate ?? '',
      endDate: suggestions.endDate ?? '',
      dieselLitres: job.dieselLitres,
      notes: job.notes ?? '',
    },
    onSubmit: () => undefined,
  });
  useEffect(() => {
    if (!startEdited && suggestions.startDate && form.state.values.startDate !== suggestions.startDate)
      form.setFieldValue('startDate', suggestions.startDate);
    if (!endEdited && suggestions.endDate && form.state.values.endDate !== suggestions.endDate)
      form.setFieldValue('endDate', suggestions.endDate);
  }, [suggestions.startDate, suggestions.endDate, startEdited, endEdited, form]);
  const complete = useMutation(
    trpc.contractingJobs.jobs.complete.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Job completed');
        setConfirm(false);
      },
      onError: async (error) => {
        if ((error as { data?: { appCode?: string } }).data?.appCode === 'contracting_job.stint_not_planned') {
          toast.error('The planned machines changed — reloading');
          await invalidateJobs();
        } else showError(error, 'Unable to complete Job.');
      },
    }),
  );
  const gate = canComplete(job.assignments);
  return (
    <>
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Suggested from the earliest arrival and latest departure — edit if the Job ran longer.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <form.AppField name="dieselLitres">
            {(field) => <field.NumberField label="Diesel supplied (litres)" decimals={2} min={0} />}
          </form.AppField>
          <form.AppField name="startDate">
            {(field) => <field.DatePickerField label="Start" onValueCommit={() => setStartEdited(true)} />}
          </form.AppField>
          <form.AppField name="endDate">
            {(field) => <field.DatePickerField label="End" onValueCommit={() => setEndEdited(true)} />}
          </form.AppField>
          <form.AppField name="notes">{(field) => <field.TextareaField label="Site notes" />}</form.AppField>
        </div>
      </div>
      <form.Subscribe selector={(state) => state.values}>
        {(values) => {
          const input = JobCompleteInput.safeParse({
            id: job.id,
            ...values,
            notes: values.notes.trim() || null,
            removePlannedAssignmentIds: plannedIds,
          });
          return (
            <>
              <div className="flex items-center gap-3">
                <Button
                  disabled={!capabilities.complete || !gate.ok || !input.success}
                  onClick={() => setConfirm(true)}
                >
                  Complete
                </Button>
                {!gate.ok ? (
                  <p className="text-destructive">
                    {gate.onSite
                      ? `${gate.onSite} ${gate.onSite === 1 ? 'machine is' : 'machines are'} still on site. `
                      : ''}
                    {gate.openGapFlags
                      ? `${gate.openGapFlags} Gap ${gate.openGapFlags === 1 ? 'Flag is' : 'Flags are'} open.`
                      : ''}
                  </p>
                ) : null}
              </div>
              <ErrorMessage error={complete.error} fallbackMessage="Unable to complete Job." />
              <Dialog open={confirm} onOpenChange={setConfirm}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete Job?</DialogTitle>
                    <DialogDescription>
                      Start {values.startDate} · End {values.endDate} · Diesel {values.dieselLitres} litres.{' '}
                      {plannedIds.length} planned machines will be removed.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <Button
                      disabled={!input.success || complete.isPending}
                      onClick={() => {
                        if (input.success)
                          complete.mutate(toCompleteInput(job.id, SignOffValues.parse(values), plannedIds));
                      }}
                    >
                      Complete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          );
        }}
      </form.Subscribe>
    </>
  );
}

const SavedValues = z.object({ startDate: DateOnlyIso, endDate: DateOnlyIso, dieselLitres: Litres, notes: z.string() });

function SavedSignOffDetails({
  job,
  editable,
  dieselEditable,
}: {
  job: JobDetail;
  editable: boolean;
  dieselEditable: boolean;
}) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const patch = useMutation(trpc.contractingJobs.jobs.patch.mutationOptions({ onSuccess: invalidateJobs }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: {
      startDate: job.startDate ?? '',
      endDate: job.endDate ?? '',
      dieselLitres: job.dieselLitres,
      notes: job.notes ?? '',
    },
    failureMessage: 'Unable to update sign-off details.',
    validator: SavedValues,
    toInput: (values) => JobPatchInput.parse({ id: job.id, ...values, notes: values.notes.trim() || null }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <form {...formProps} className="space-y-3">
      <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
      <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
        <form.AppField name="dieselLitres">
          {(field) => (
            <field.NumberField label="Diesel supplied (litres)" decimals={2} min={0} disabled={!dieselEditable} />
          )}
        </form.AppField>
        <form.AppField name="startDate">
          {(field) => <field.DatePickerField label="Start" onValueCommit={autosave.commit} />}
        </form.AppField>
        <form.AppField name="endDate">
          {(field) => <field.DatePickerField label="End" onValueCommit={autosave.commit} />}
        </form.AppField>
        <form.AppField name="notes">{(field) => <field.TextareaField label="Site notes" />}</form.AppField>
      </fieldset>
    </form>
  );
}
