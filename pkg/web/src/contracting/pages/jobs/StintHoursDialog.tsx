import {
  hoursEditNeedsReason,
  johnDeereDifference,
  johnDeereDifferenceWarning,
  johnDeereLine,
  judgeStintHours,
  needsALookColorClassNames,
} from '@pkg/domain/contracting';
import { AuthId, emptyStringOr, UUID } from '@pkg/schema';
import {
  type Assignment,
  type JobDetail,
  StintHoursCaptureValues,
  StintHoursEditValues,
  toStintHoursCaptureInput,
  toStintHoursEditInput,
} from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { FieldDescription, FieldError } from '@/components/ui/field.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useContractingWrite, useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { AssignmentEditorDialog, changesAssignment } from './AssignmentEditorDialog.js';
import { useAssignmentOptions } from './use-assignment-options.js';

export type StintHoursMode = 'arrival' | 'departure' | 'edit';

type JobFacts = Pick<JobDetail, 'status' | 'johnDeereDifferenceThresholdHours'>;

/** The Job Hours writes refresh what reads them: the Job, its reports, and the Machine's Known Hours. */
function useStintHoursWrite() {
  const { invalidateJobHours } = useQueryInvalidation();
  return useContractingWrite(invalidateJobHours);
}

/** John Deere's latest report under the hours, and the amber warning when the typed value is too far from it. */
function JohnDeereHint({ machineId, hours, threshold }: { machineId: string; hours: number; threshold: number }) {
  const trpc = useTRPC();
  const telematics = useQuery(trpc.contractingReadings.latestTelematics.queryOptions({ machineId }));
  if (!telematics.data) return null;
  const now = new Date();
  const difference = Number.isFinite(hours) ? johnDeereDifference(hours, telematics.data, threshold) : null;
  return (
    <div className="space-y-2">
      <FieldDescription>{johnDeereLine(telematics.data, now)}</FieldDescription>
      {difference?.over ? (
        <p
          className={cn(
            'rounded-lg border p-3 text-sm',
            needsALookColorClassNames.chip,
            needsALookColorClassNames.text,
          )}
          role="status"
        >
          {johnDeereDifferenceWarning(difference.hours, telematics.data, now)}
        </p>
      ) : null}
    </div>
  );
}

function StintHoursRefusal(hours: { arrival: number; departure: number | null }) {
  const verdict = judgeStintHours(hours);
  return verdict.ok ? null : <FieldError>{verdict.refusal.message}</FieldError>;
}

const CaptureValues = StintHoursCaptureValues.extend({
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(AuthId),
});
type CaptureValues = z.infer<typeof CaptureValues>;

function CaptureHoursDialog({
  side: role,
  stint,
  job,
  onClose,
}: {
  side: 'arrival' | 'departure';
  stint: Assignment | null;
  job: JobFacts;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const write = useStintHoursWrite();
  const capture = useMutation(trpc.contractingJobs.assignments.captureHours.mutationOptions(write.dialog));
  useResetOnOpen(capture, !!stint);
  const arrival = role === 'arrival';
  const options = useAssignmentOptions({
    enabled: !!stint && arrival,
    stint,
    noImplementLabel: 'No implement',
    noDriverLabel: 'No driver',
    freeImplementsOnly: true,
  });
  const arrivalHours = stint?.arrival?.hours ?? null;
  const canSave = (values: CaptureValues) =>
    Number.isFinite(values.hours) &&
    (arrival
      ? !changesAssignment(stint, values) || options.ready
      : arrivalHours !== null && judgeStintHours({ arrival: arrivalHours, departure: values.hours }).ok);
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        <MachineDialogTitle machine={stint}>{arrival ? 'Capture arrival' : 'Capture departure'}</MachineDialogTitle>
      }
      contentClassName="sm:max-w-md"
      submitLabel="Save hours"
      defaultValues={{
        hours: Number.NaN,
        comment: '',
        implementId: stint?.implementId ?? '',
        driverUserId: stint?.driverUserId ?? '',
      }}
      validator={CaptureValues}
      canSubmit={canSave}
      onBeforeCreate={canSave}
      onCreate={(values) =>
        stint
          ? capture.mutateAsync(
              toStintHoursCaptureInput(
                { assignmentId: stint.id, role },
                values,
                arrival && changesAssignment(stint, values)
                  ? { implementId: values.implementId || null, driverUserId: values.driverUserId || null }
                  : undefined,
              ),
            )
          : Promise.resolve()
      }
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField name="hours">
            {(field) => <field.NumberField label="Hours on the meter" decimals={1} min={0} unit="hours" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.hours}>
            {(hours) => (
              <>
                {!arrival && arrivalHours !== null && Number.isFinite(hours) ? (
                  <StintHoursRefusal arrival={arrivalHours} departure={hours} />
                ) : null}
                {stint ? (
                  <JohnDeereHint
                    hours={hours}
                    machineId={stint.machineId}
                    threshold={job.johnDeereDifferenceThresholdHours}
                  />
                ) : null}
              </>
            )}
          </form.Subscribe>
          <form.AppField name="comment">{(field) => <field.TextareaField label="Comment (optional)" />}</form.AppField>
          {arrival && stint ? (
            <form.Subscribe
              selector={(state) => ({ implementId: state.values.implementId, driverUserId: state.values.driverUserId })}
            >
              {({ implementId, driverUserId }) => {
                const implementLabel =
                  options.implementOptions.find((entry) => entry.value === implementId)?.label ?? 'No implement';
                const driverLabel =
                  options.driverOptions.find((entry) => entry.value === driverUserId)?.label ?? 'No driver';
                return (
                  <Card className="bg-muted/30" size="sm">
                    <CardHeader>
                      <CardTitle>Starting assignment</CardTitle>
                      <CardAction>
                        <AssignmentEditorDialog
                          stint={{ ...stint, implementId: implementId || null, driverUserId: driverUserId || null }}
                          implementOptions={options.implementOptions}
                          driverOptions={options.driverOptions}
                          canSave={options.ready}
                          error={options.error}
                          submitLabel="Apply"
                          onSave={async (draft) => {
                            form.setFieldValue('implementId', draft.implementId);
                            form.setFieldValue('driverUserId', draft.driverUserId);
                          }}
                        />
                      </CardAction>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 gap-3">
                      <div className="min-w-0 space-y-2">
                        <span className="block text-xs text-muted-foreground">Implement</span>
                        <span className="block truncate" title={implementLabel}>
                          {implementLabel}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-2">
                        <span className="block text-xs text-muted-foreground">Driver</span>
                        <span className="block truncate" title={driverLabel}>
                          {driverLabel}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                );
              }}
            </form.Subscribe>
          ) : null}
          <ErrorMessage error={capture.error} fallbackMessage="Unable to save the hours." />
        </>
      )}
    </CreateEntityDialog>
  );
}

function EditHoursDialog({ stint, job, onClose }: { stint: Assignment | null; job: JobFacts; onClose: () => void }) {
  const trpc = useTRPC();
  const write = useStintHoursWrite();
  const edit = useMutation(trpc.contractingJobs.assignments.editHours.mutationOptions(write.dialog));
  useResetOnOpen(edit, !!stint);
  const needsReason = hoursEditNeedsReason(job.status);
  const left = stint?.departure !== null && stint?.departure !== undefined;
  const canSave = (values: StintHoursEditValues) =>
    Number.isFinite(values.arrivalHours) &&
    (!left || (values.departureHours !== null && Number.isFinite(values.departureHours))) &&
    judgeStintHours({ arrival: values.arrivalHours, departure: values.departureHours }).ok &&
    (!needsReason || values.reason.trim() !== '');
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={<MachineDialogTitle machine={stint}>Edit hours</MachineDialogTitle>}
      contentClassName="sm:max-w-lg"
      submitLabel="Save hours"
      defaultValues={{
        arrivalHours: stint?.arrival?.hours ?? Number.NaN,
        departureHours: stint?.departure?.hours ?? null,
        arrivalComment: stint?.arrival?.comment ?? '',
        departureComment: stint?.departure?.comment ?? '',
        reason: '',
      }}
      validator={StintHoursEditValues}
      canSubmit={canSave}
      onBeforeCreate={canSave}
      onCreate={(values) => (stint ? edit.mutateAsync(toStintHoursEditInput(stint.id, values)) : Promise.resolve())}
      onCreated={onClose}
    >
      {(form) => (
        <>
          <section className="grid gap-3">
            <form.AppField name="arrivalHours">
              {(field) => <field.NumberField label="Arrival hours" decimals={1} min={0} unit="hours" />}
            </form.AppField>
            {stint ? (
              <form.Subscribe selector={(state) => state.values.arrivalHours}>
                {(hours) => (
                  <JohnDeereHint
                    hours={hours}
                    machineId={stint.machineId}
                    threshold={job.johnDeereDifferenceThresholdHours}
                  />
                )}
              </form.Subscribe>
            ) : null}
            <form.AppField name="arrivalComment">
              {(field) => <field.TextareaField label="Arrival comment (optional)" />}
            </form.AppField>
          </section>
          {left ? (
            <section className="grid gap-3 border-t pt-4">
              <form.AppField name="departureHours">
                {(field) => <field.NumberField label="Departure hours" decimals={1} min={0} unit="hours" />}
              </form.AppField>
              <form.Subscribe
                selector={(state) => ({ arrival: state.values.arrivalHours, departure: state.values.departureHours })}
              >
                {({ arrival, departure }) => (
                  <>
                    {Number.isFinite(arrival) ? <StintHoursRefusal arrival={arrival} departure={departure} /> : null}
                    {stint && departure !== null ? (
                      <JohnDeereHint
                        hours={departure}
                        machineId={stint.machineId}
                        threshold={job.johnDeereDifferenceThresholdHours}
                      />
                    ) : null}
                  </>
                )}
              </form.Subscribe>
              <form.AppField name="departureComment">
                {(field) => <field.TextareaField label="Departure comment (optional)" />}
              </form.AppField>
            </section>
          ) : null}
          {needsReason ? (
            <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
          ) : null}
          <ErrorMessage error={edit.error} fallbackMessage="Unable to save the hours." />
        </>
      )}
    </CreateEntityDialog>
  );
}

/** Captures a stint's arrival or departure hours, or edits both; the server's sentence shows on a refusal. */
export function StintHoursDialog({
  target,
  job,
  onClose,
}: {
  target: { mode: StintHoursMode; stint: Assignment } | null;
  job: JobFacts;
  onClose: () => void;
}) {
  return (
    <>
      <CaptureHoursDialog
        side="arrival"
        stint={target?.mode === 'arrival' ? target.stint : null}
        job={job}
        onClose={onClose}
      />
      <CaptureHoursDialog
        side="departure"
        stint={target?.mode === 'departure' ? target.stint : null}
        job={job}
        onClose={onClose}
      />
      <EditHoursDialog stint={target?.mode === 'edit' ? target.stint : null} job={job} onClose={onClose} />
    </>
  );
}
