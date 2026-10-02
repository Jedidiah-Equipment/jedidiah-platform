import { formatDate, formatNumber } from '@pkg/domain';
import { canComplete, completionGateReasons, groupStints, suggestJobDates } from '@pkg/domain/contracting';
import { DateOnlyIso } from '@pkg/schema';
import { JobCompleteInput, type JobDetail, JobPatchInput, Litres } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveStatus, useAppForm, useAutosaveForm, useTypedAppFormContext } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { getApiErrorAppCode } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import type { JobSheet } from './types.js';
import { useJobWrite, useResetOnOpen } from './use-job-write.js';

const signOffFieldDefaults = { startDate: '', endDate: '', dieselLitres: 0, notes: '' };

function SignOffFields({
  onDateCommit,
  dieselEditable = true,
}: {
  onDateCommit: (field: 'startDate' | 'endDate') => void;
  dieselEditable?: boolean;
}) {
  const form = useTypedAppFormContext({ defaultValues: signOffFieldDefaults });
  return (
    <>
      <form.AppField name="startDate">
        {(field) => <field.DatePickerField label="Start" onValueCommit={() => onDateCommit('startDate')} />}
      </form.AppField>
      <form.AppField name="endDate">
        {(field) => <field.DatePickerField label="End" onValueCommit={() => onDateCommit('endDate')} />}
      </form.AppField>
      <form.AppField name="dieselLitres">
        {(field) => (
          <field.NumberField label="Diesel supplied (litres)" decimals={2} min={0} disabled={!dieselEditable} />
        )}
      </form.AppField>
      <form.AppField name="notes">{(field) => <field.TextareaField label="Site notes" />}</form.AppField>
    </>
  );
}

export function SignOffCard({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-off</CardTitle>
        <CardAction>
          <HelpLink label="How to sign off a Job" topic="contractingJobSignOff" />
        </CardAction>
      </CardHeader>
      {job.status === 'active' ? (
        <DraftSignOffDetails job={job} sheet={sheet} />
      ) : (
        <CardContent>
          <SavedSignOffDetails
            job={job}
            editable={sheet.can('editSignOffDetails')}
            dieselEditable={sheet.can('editDieselLitres')}
          />
        </CardContent>
      )}
    </Card>
  );
}

function DraftSignOffDetails({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const { planned } = groupStints(job.assignments);
  const plannedIds = planned.map((stint) => stint.id);
  const remove = useMutation(
    trpc.contractingJobs.assignments.remove.mutationOptions(write.card('Unable to remove planned Machine.')),
  );
  const [confirm, setConfirm] = useState(false);
  const [startEdited, setStartEdited] = useState(false);
  const [endEdited, setEndEdited] = useState(false);
  const suggestions = useMemo(() => suggestJobDates(job.assignments), [job.assignments]);
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
        await write.invalidateJobs();
        toast.success('Job completed');
        setConfirm(false);
      },
      onError: async (error) => {
        write.report(error);
        if (getApiErrorAppCode(error) === 'contracting_job.stint_not_planned') await write.invalidateJobs();
      },
    }),
  );
  useResetOnOpen(complete, confirm);
  const gate = canComplete(job.assignments);
  const completeAction = sheet.action('complete');
  return (
    <>
      <CardContent className="space-y-4">
        <form.AppForm>
          <div className="grid gap-3 sm:grid-cols-2">
            <SignOffFields
              onDateCommit={(field) => (field === 'startDate' ? setStartEdited(true) : setEndEdited(true))}
            />
          </div>
        </form.AppForm>
        {planned.length ? (
          <section className="space-y-2">
            <h3 className="font-medium">Planned, never arrived</h3>
            <p className="text-muted-foreground">These machines never arrived. Complete removes any still listed.</p>
            {planned.map((stint) => (
              <div key={stint.id} className="flex items-center justify-between rounded border p-2 opacity-60">
                <span>
                  {stint.machineCode} · {stint.implementCode ?? 'No Implement'}
                </span>
                {sheet.can('assign') ? (
                  <RemoveEntityButton
                    title={<MachineDialogTitle machine={stint}>Remove planned Machine</MachineDialogTitle>}
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
              <CardFooter className="justify-end gap-3">
                {!gate.ok ? <p className="text-destructive">{completionGateReasons(gate).join(' ')}</p> : null}
                {completeAction ? (
                  <Button
                    className="shrink-0"
                    disabled={completeAction.disabled || !gate.ok || !input.success}
                    title={completeAction.title}
                    onClick={() => setConfirm(true)}
                  >
                    Complete
                  </Button>
                ) : null}
              </CardFooter>
              <Dialog open={confirm} onOpenChange={setConfirm}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Complete Job?</DialogTitle>
                    <DialogDescription>
                      Start {formatDate(values.startDate, 'short')} · End {formatDate(values.endDate, 'short')} · Diesel{' '}
                      {formatNumber(values.dieselLitres, { decimals: 2 })} litres. {formatNumber(plannedIds.length)}{' '}
                      planned machines will be removed.
                    </DialogDescription>
                  </DialogHeader>
                  <ErrorMessage error={complete.error} fallbackMessage="Unable to complete Job." />
                  <DialogFooter>
                    <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                    <Button
                      disabled={!input.success || complete.isPending}
                      onClick={() => {
                        if (input.success) complete.mutate(input.data);
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
      <form.AppForm>
        <fieldset disabled={!editable} className="grid gap-3 sm:grid-cols-2">
          <SignOffFields onDateCommit={() => autosave.commit()} dieselEditable={dieselEditable} />
        </fieldset>
      </form.AppForm>
    </form>
  );
}
