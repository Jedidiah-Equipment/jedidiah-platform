import {
  DEPARTMENT_TIMING_STATUS,
  type DepartmentTimingState,
  departmentLabels,
  formatDate,
  getDepartmentTimingPresentation,
  getFirstName,
  getPlantDateNow,
  isJobCancelled,
  statusBadgeColorClassNames,
  toPlantDateOnly,
  WORK_ITEM_DEPARTMENTS,
} from '@pkg/domain';
import {
  AuthId,
  DateIso,
  type JobDepartmentTiming,
  JobDepartmentTimingCompleteInput,
  type JobDetail,
  type WorkItemDepartment,
} from '@pkg/schema';
import { IconAlertTriangle, IconChevronDown, IconPencil } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { DepartmentIcon } from '@/components/departments/index.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Separator } from '@/components/ui/separator.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

const DoneFormValues = z.object({ crewUserIds: JobDepartmentTimingCompleteInput.shape.crewUserIds });
type DoneFormValues = z.infer<typeof DoneFormValues>;

const CorrectionFormValues = z
  .object({
    completedOn: z.string(),
    crewUserIds: z.array(AuthId),
    startedOn: z.string(),
  })
  .superRefine((value, ctx) => {
    if (!value.startedOn) {
      if (value.completedOn) {
        ctx.addIssue({ code: 'custom', message: 'A done date needs a start date.', path: ['startedOn'] });
      }

      return;
    }

    if (value.completedOn && value.completedOn < value.startedOn) {
      ctx.addIssue({
        code: 'custom',
        message: 'The done date cannot be before the start date.',
        path: ['completedOn'],
      });
    }

    if (value.completedOn && value.crewUserIds.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Name at least one crew member.', path: ['crewUserIds'] });
    }
  });
type CorrectionFormValues = z.infer<typeof CorrectionFormValues>;

/** The four Department Timing observation cards shown on the Job sheet. */
export const JobDepartmentTimingCards: React.FC<{ job: JobDetail }> = ({ job }) => {
  const offDays = useOrgOffDays(job.departmentTimings.some((timing) => timing.completedAt !== null));

  return (
    <>
      {WORK_ITEM_DEPARTMENTS.map((department) => {
        const timing = job.departmentTimings.find((entry) => entry.department === department);
        return timing ? <JobDepartmentTimingCard job={job} key={department} offDays={offDays} timing={timing} /> : null;
      })}
    </>
  );
};

const JobDepartmentTimingCard: React.FC<{
  job: JobDetail;
  offDays: ReadonlySet<string>;
  timing: JobDepartmentTiming;
}> = ({ job, offDays, timing }) => {
  const [isOpen, setIsOpen] = useState(false);
  const canUpdate = useCan('job:update').can;
  const department = timing.department;
  const departmentLabel = departmentLabels[department];

  // A completed Job still accepts the one stamp that closes an observation already open. The
  // completion sweep can latch the Job while Department work that overran its Slot is still open.
  const hasOpenObservation = timing.startedAt !== null && timing.completedAt === null;
  const canStamp = canUpdate && !isJobCancelled(job) && (job.completedOn === null || hasOpenObservation);
  const presentation = getDepartmentTimingPresentation({
    department,
    timing,
    today: getPlantDateNow(),
    workingCalendar: { orgOffDays: offDays },
  });

  return (
    <Collapsible onOpenChange={setIsOpen} open={isOpen}>
      <Card>
        <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-1! sm:has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]!">
          <CardTitle className="flex min-w-0 items-center gap-2">
            <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <DepartmentIcon className="size-5 shrink-0" department={department} />
              <span className="truncate">{departmentLabel}</span>
              <IconChevronDown
                aria-hidden="true"
                className={cn('size-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')}
              />
            </CollapsibleTrigger>
            <HelpLink label={`How to stamp ${departmentLabel.toLowerCase()} times`} topic="jobDepartmentTimes" />
          </CardTitle>
          <CardAction
            className="col-start-1 row-start-2 mt-2 flex flex-wrap items-center gap-2 justify-self-stretch sm:col-start-2 sm:row-start-1 sm:mt-0 sm:justify-self-end"
            span="title"
          >
            <DepartmentTimingStatusBadge state={presentation.state} />
            {canStamp ? <DepartmentTimingStampAction job={job} timing={timing} /> : null}
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardSeparator />
          <CardContent className="pt-4">
            <DepartmentTimingSummary job={job} presentation={presentation} timing={timing} />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const DepartmentTimingSummary: React.FC<{
  job: JobDetail;
  presentation: ReturnType<typeof getDepartmentTimingPresentation>;
  timing: JobDepartmentTiming;
}> = ({ job, presentation, timing }) => {
  const duration = presentation.durationDays;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2 py-1">
        <h3 className="text-sm leading-normal font-medium">{presentation.headline}</h3>
        {timing.department === 'fabrication' &&
        presentation.state === 'not-started' &&
        isFabricationOverdueToStart(job) ? (
          <Badge variant="outline">
            <IconAlertTriangle data-icon="inline-start" />
            Fabrication not started?
          </Badge>
        ) : null}
      </div>
      <Separator className="-mx-4 w-[calc(100%+2rem)] max-w-none" />
      <dl className="grid gap-3 sm:grid-cols-3 sm:gap-0">
        <TimingFact label="Started" value={formatDate(timing.startedAt, 'short', '—')} />
        <TimingFact
          className="sm:border-l sm:px-4"
          label="Finished"
          value={formatDate(timing.completedAt, 'short', '—')}
        />
        <TimingFact
          className="sm:border-l sm:pl-4"
          label="Duration"
          value={duration === null ? '—' : `${duration} ${duration === 1 ? 'day' : 'days'}`}
        />
      </dl>
      {presentation.state === 'complete' && timing.crew.length > 0 ? (
        <>
          <Separator className="-mx-4 w-[calc(100%+2rem)] max-w-none" />
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <span className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">Crew</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {timing.crew.map((member) => (
                <div className="flex items-center gap-2" key={member.userId}>
                  <EntityThumbnail label={member.name} preview={false} shape="circle" size="sm" />
                  <span className="font-medium">{getFirstName(member.name)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

const TimingFact: React.FC<{ className?: string; label: string; value: string }> = ({ className, label, value }) => (
  <div className={cn('min-w-0', className)}>
    <dt className="font-mono text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
    <dd className="mt-2 font-medium tabular-nums">{value}</dd>
  </div>
);

const DepartmentTimingStatusBadge: React.FC<{ state: DepartmentTimingState }> = ({ state }) => {
  const status = DEPARTMENT_TIMING_STATUS[state];
  const color = statusBadgeColorClassNames[status.color];

  return (
    <Badge className={cn(color.chip, color.text, 'font-mono tracking-wide')} variant="outline">
      {status.label}
    </Badge>
  );
};

const DepartmentTimingStampAction: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  if (timing.startedAt === null) {
    return <StartDepartmentButton department={timing.department} job={job} />;
  }

  if (timing.completedAt === null) {
    return <CompleteDepartmentButton job={job} timing={timing} />;
  }

  return <CorrectDepartmentButton job={job} timing={timing} />;
};

const StartDepartmentButton: React.FC<{ department: WorkItemDepartment; job: JobDetail }> = ({ department, job }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const { invalidateJobs, invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const departmentLabel = departmentLabels[department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();
  const startMutation = useMutation(
    trpc.jobs.startDepartmentTiming.mutationOptions({
      onError: (error) => showMutationError(error, `Unable to start ${lowerDepartmentLabel}.`),
      onSuccess: async () => {
        setIsOpen(false);
        await Promise.all([invalidateJobs(), invalidateProducts()]);
        toast.success(`${departmentLabel} started`);
      },
    }),
  );

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger render={<Button size="sm" type="button" variant="outline" />}>
        Start {lowerDepartmentLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start {lowerDepartmentLabel}</DialogTitle>
          <DialogDescription>
            This records that {lowerDepartmentLabel} work on {job.code} started now. It changes no schedule — correct it
            later if the time is wrong.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={startMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate({ department, id: job.id })}
            type="button"
          >
            Start {lowerDepartmentLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CompleteDepartmentButton: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const { invalidateJobs, invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const crewOptions = useCrewOptions(isOpen, timing);
  const departmentLabel = departmentLabels[timing.department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();
  const crewLabel = timing.department === 'fabrication' ? 'Fabricators' : 'Crew members';
  const completeMutation = useMutation(
    trpc.jobs.completeDepartmentTiming.mutationOptions({
      onError: (error) => showMutationError(error, `Unable to record ${lowerDepartmentLabel} as done.`),
    }),
  );

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="outline">
        {departmentLabel} done
      </Button>
      <CreateEntityDialog
        defaultValues={{ crewUserIds: timing.suggestedCrew.map((member) => member.userId) }}
        description={
          // Corrections are refused on a completed Job, so this stamp is frozen the moment it lands.
          job.completedOn === null
            ? `Record ${lowerDepartmentLabel} on ${job.code} as done now, and name the ${crewLabel.toLowerCase()}.`
            : `Record ${lowerDepartmentLabel} on ${job.code} as done now, and name the ${crewLabel.toLowerCase()}. ${job.code} is already completed, so this cannot be corrected afterwards — check the names before saving.`
        }
        key={isOpen ? 'open' : 'closed'}
        onCreate={(values: DoneFormValues) =>
          completeMutation.mutateAsync({
            crewUserIds: values.crewUserIds,
            department: timing.department,
            id: job.id,
          })
        }
        onCreated={async () => {
          setIsOpen(false);
          await Promise.all([invalidateJobs(), invalidateProducts()]);
          toast.success(`${departmentLabel} done`);
        }}
        onOpenChange={setIsOpen}
        open={isOpen}
        submitLabel={`${departmentLabel} done`}
        title={`${departmentLabel} done`}
        validator={DoneFormValues}
      >
        {(form) => (
          <form.AppField name="crewUserIds">
            {(field) => (
              <field.MultiComboboxField
                emptyMessage="No Bay Operators found."
                label={crewLabel}
                options={crewOptions}
                placeholder="Choose who crewed this"
              />
            )}
          </form.AppField>
        )}
      </CreateEntityDialog>
    </>
  );
};

const CorrectDepartmentButton: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const { invalidateJobs, invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const crewOptions = useCrewOptions(isOpen, timing);
  const plantToday = getPlantDateNow();
  const departmentLabel = departmentLabels[timing.department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();
  const crewLabel = timing.department === 'fabrication' ? 'Fabricators' : 'Crew members';
  const updateMutation = useMutation(
    trpc.jobs.updateDepartmentTiming.mutationOptions({
      onError: (error) => showMutationError(error, `Unable to correct the ${lowerDepartmentLabel} times.`),
    }),
  );

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="outline">
        <IconPencil data-icon="inline-start" />
        Edit times
      </Button>
      <CreateEntityDialog
        defaultValues={{
          completedOn: timing.completedAt ? toPlantDateOnly(new Date(timing.completedAt)) : '',
          crewUserIds: timing.crew.map((member) => member.userId),
          startedOn: timing.startedAt ? toPlantDateOnly(new Date(timing.startedAt)) : '',
        }}
        description={`Correct what was stamped. Clearing the start date removes the ${lowerDepartmentLabel} stamps and their crew altogether.`}
        key={isOpen ? 'open' : 'closed'}
        onCreate={(values: CorrectionFormValues) =>
          updateMutation.mutateAsync({
            completedAt: values.completedOn ? DateIso.parse(values.completedOn) : null,
            // Crew only exists against a done stamp, so clearing the dates has to clear the crew too.
            crewUserIds: values.completedOn ? values.crewUserIds : [],
            department: timing.department,
            id: job.id,
            startedAt: values.startedOn ? DateIso.parse(values.startedOn) : null,
          })
        }
        onCreated={async () => {
          setIsOpen(false);
          await Promise.all([invalidateJobs(), invalidateProducts()]);
          toast.success(`${departmentLabel} times updated`);
        }}
        onOpenChange={setIsOpen}
        open={isOpen}
        submitLabel="Save times"
        title={`Edit ${lowerDepartmentLabel} times`}
        validator={CorrectionFormValues}
      >
        {(form) => (
          <>
            <form.AppField name="startedOn">
              {(field) => <field.DatePickerField label="Started" maxValue={plantToday} placeholder="Not started" />}
            </form.AppField>
            <form.AppField name="completedOn">
              {(field) => <field.DatePickerField label="Done" maxValue={plantToday} placeholder="Not done" />}
            </form.AppField>
            <form.AppField name="crewUserIds">
              {(field) => (
                <field.MultiComboboxField
                  emptyMessage="No Bay Operators found."
                  label={crewLabel}
                  options={crewOptions}
                  placeholder="Choose who crewed this"
                />
              )}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
};

/** The Bay Operator pool, offered only while a dialog is open. */
function useCrewOptions(enabled: boolean, timing: JobDepartmentTiming): { label: string; value: string }[] {
  const trpc = useTRPC();
  const operatorsQuery = useQuery(trpc.jobs.listBayOperators.queryOptions(undefined, { enabled }));
  const operators = operatorsQuery.data?.operators ?? [];
  const known = new Map(operators.map((operator) => [operator.id, operator.name]));

  // A recorded crew member whose role has since changed still has to remain editable.
  for (const member of timing.crew) {
    if (!known.has(member.userId)) known.set(member.userId, member.name);
  }

  return [...known.entries()].map(([value, label]) => ({ label, value }));
}

/** The same org Off-Day set the metrics count with, read off the shared Board query. */
function useOrgOffDays(enabled: boolean): ReadonlySet<string> {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled }));

  return useMemo(() => new Set((baysQuery.data?.offDays ?? []).map((offDay) => offDay.date)), [baysQuery.data]);
}

/** The fabrication-only forgotten-start nudge retained from the original timing workflow. */
function isFabricationOverdueToStart(job: JobDetail): boolean {
  if (isJobCancelled(job) || job.completedOn !== null) {
    return false;
  }

  const firstWorkDay = job.schedule
    .filter((department) => department.department === 'fabrication')
    .flatMap((department) => department.bays)
    .flatMap((bay) => bay.slots)
    .map((slot) => slot.firstWorkDay)
    .sort()
    .at(0);

  return firstWorkDay !== undefined && getPlantDateNow() >= firstWorkDay;
}
