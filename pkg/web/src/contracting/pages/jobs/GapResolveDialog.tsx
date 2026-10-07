import { formatDate, formatHours } from '@pkg/domain';
import {
  assignmentAttentionKindLevels,
  assignmentAttentionLevelColorClassNames,
  hourGapExplanation,
  splitGap,
} from '@pkg/domain/contracting';
import { type Assignment, GapResolveInput, type JobReading, type PreviousDeparture } from '@pkg/schema/contracting';
import { IconArrowRight, IconInfoCircle } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { useJobWrite } from './use-job-write.js';

const GapValues = GapResolveInput.omit({ id: true });
const gapColors = assignmentAttentionLevelColorClassNames[assignmentAttentionKindLevels['gap-flag']];

function MeterEnd({
  label,
  reading,
  detail,
}: {
  label: string;
  reading: Pick<JobReading, 'value' | 'capturedAt'> | null;
  detail: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <span className="block text-xs font-medium">{label}</span>
      <div className="text-lg font-semibold">{reading ? formatHours(reading.value) : '—'}</div>
      <div className="truncate text-xs text-muted-foreground">{detail}</div>
      {reading ? <div className="text-xs text-muted-foreground">{formatDate(reading.capturedAt, 'medium')}</div> : null}
    </div>
  );
}

function previousJobDetail(previous: PreviousDeparture | null) {
  if (!previous) return 'No earlier departure';
  if (!previous.job) return 'Previous Job';
  return (
    <span title={`${previous.job.jobNumber} · ${previous.job.customerName} · ${previous.job.farmName}`}>
      <span className="font-mono">{previous.job.jobNumber}</span> · {previous.job.customerName} ·{' '}
      {previous.job.farmName}
    </span>
  );
}

function HourMeterCard({ stint, gapHours }: { stint: Assignment; gapHours: number }) {
  return (
    <Card className="bg-muted/30" size="sm">
      <CardContent className="space-y-3">
        <div className="grid grid-cols-[minmax(0,1fr)_1.25rem_minmax(0,1fr)] items-start gap-3">
          <MeterEnd
            label="Left previous Job"
            reading={stint.previousDeparture}
            detail={previousJobDetail(stint.previousDeparture)}
          />
          <IconArrowRight aria-hidden="true" className="mt-7 size-5 text-muted-foreground" />
          <MeterEnd label="Arrived on this Job" reading={stint.arrival} detail="Arrival reading" />
        </div>
        <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>Hours the meter ran in between</span>
          <Badge className={cn(gapColors.chip, gapColors.text)} variant="outline">
            {formatHours(gapHours)} gap
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

export function GapResolveDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const resolve = useMutation(trpc.contractingJobs.assignments.resolveGap.mutationOptions(write.dialog));
  useResetOnOpen(resolve, !!stint);
  const gapHours = stint?.gapHours ?? 0;
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={
        <MachineDialogTitle machine={stint}>
          {stint?.gapResolved ? 'Edit' : 'Resolve'} {formatHours(gapHours)} gap
        </MachineDialogTitle>
      }
      description={hourGapExplanation(gapHours)}
      contentClassName="sm:max-w-xl"
      defaultValues={
        stint?.gapResolved
          ? { travelHours: stint.travelHours, unaccountedHours: stint.unaccountedHours, reason: stint.gapReason ?? '' }
          : { travelHours: gapHours, unaccountedHours: 0, reason: '' }
      }
      validator={GapValues}
      onCreate={(values) => resolve.mutateAsync({ id: stint?.id ?? '', ...values })}
      onCreated={onClose}
    >
      {(form) => (
        <>
          {stint ? <HourMeterCard gapHours={gapHours} stint={stint} /> : null}
          <Alert>
            <IconInfoCircle aria-hidden="true" />
            <AlertTitle>What you are deciding</AlertTitle>
            <AlertDescription>
              Split the {formatHours(gapHours)} into the time the Machine spent travelling here and time that is
              unaccounted for, such as standing in the yard or a repair. Travel Hours are billed to this Job at the
              Assignment’s rate
              {stint?.travelIncluded
                ? '.'
                : ', even though travel is excluded on this Assignment: enter 0 to bill none.'}{' '}
              An Unaccounted Interval is never billed. Give a reason either way; it stays on the Job.
            </AlertDescription>
          </Alert>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <form.AppField
              name="travelHours"
              listeners={{
                onChange: ({ value }) =>
                  form.setFieldValue('unaccountedHours', splitGap(gapHours, value).unaccountedHours, {
                    dontRunListeners: true,
                  }),
                onBlur: ({ value }) =>
                  form.setFieldValue('travelHours', splitGap(gapHours, value).travelHours, { dontRunListeners: true }),
              }}
            >
              {(field) => (
                <field.NumberField
                  label="Travel Hours"
                  description={`Billed to the client, up to ${formatHours(gapHours)}`}
                  decimals={1}
                  min={0}
                  emptyValue={0}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.unaccountedHours}>
              {(unaccountedHours) => (
                <div className="space-y-2">
                  <span className="block text-sm font-medium">Unaccounted Interval</span>
                  <output aria-live="polite" className="flex h-9 items-center text-lg font-semibold">
                    {formatHours(unaccountedHours)}
                  </output>
                  <span className="block text-sm text-muted-foreground">The rest of the gap, never billed</span>
                </div>
              )}
            </form.Subscribe>
          </div>
          <form.AppField name="reason">
            {(field) => (
              <field.TextareaField
                label="Reason"
                placeholder="For example: stood in the yard for a tyre repair before moving to this Job"
              />
            )}
          </form.AppField>
          <ErrorMessage error={resolve.error} fallbackMessage="Unable to resolve Gap Flag." />
        </>
      )}
    </CreateEntityDialog>
  );
}
