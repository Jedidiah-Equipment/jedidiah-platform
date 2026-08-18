import { formatDate, getPlantDateNow, isJobCancelled, timingWorkingDays, toPlantDateOnly } from '@pkg/domain';
import { AuthId, DateIso, type JobDepartmentTiming, type JobDetail } from '@pkg/schema';
import { IconAlertTriangle, IconPencil } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { DepartmentIcon } from '@/components/departments/index.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { HelpLink } from '@/components/help/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
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
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

const DoneFormValues = z.object({ crewUserIds: z.array(AuthId).min(1, 'Name at least one fabricator') });
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
      ctx.addIssue({ code: 'custom', message: 'Name at least one fabricator.', path: ['crewUserIds'] });
    }
  });
type CorrectionFormValues = z.infer<typeof CorrectionFormValues>;

/**
 * Fabrication's Department Timing stamps on the Job sheet. Only fabrication is surfaced: the storage
 * behind it is per-department, but nobody has asked to stamp paint or assembly yet.
 *
 * The stamps are an observation log — they drive no schedule and gate nothing — so this section sits
 * beside the Job's details rather than anywhere near the Board. Actions are hidden, not disabled, once
 * the Job's completion latches them shut: a permanently dead button is only furniture.
 */
export const JobFabricationAction: React.FC<{ job: JobDetail }> = ({ job }) => {
  const timing = job.departmentTimings.find((entry) => entry.department === 'fabrication');
  const canUpdate = useCan('job:update').can;

  if (!timing) {
    return null;
  }

  // A completed Job still accepts the one stamp that closes an observation already open, mirroring
  // core exactly: the completion sweep latches `completedOn` the day after the last Slot ends, so an
  // overrunning fabrication run would otherwise be left with no way to record that it finished.
  // Starting a new observation and correcting a recorded one stay hidden.
  const hasOpenObservation = timing.startedAt !== null && timing.completedAt === null;
  const canStamp = canUpdate && !isJobCancelled(job) && (job.completedOn === null || hasOpenObservation);

  return (
    <Card>
      <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
        <CardTitle className="flex min-w-0 items-center gap-2">
          <DepartmentIcon className="size-4 text-muted-foreground" department="fabrication" />
          <span className="truncate">Fabrication</span>
          <HelpLink label="How to stamp fabrication times" topic="jobFabrication" />
        </CardTitle>
        {canStamp ? (
          <CardAction span="title">
            <FabricationStampAction job={job} timing={timing} />
          </CardAction>
        ) : null}
      </CardHeader>
      <CardSeparator />
      <CardContent>
        <FabricationSummary job={job} timing={timing} />
      </CardContent>
    </Card>
  );
};

const FabricationSummary: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  const offDays = useOrgOffDays();

  if (timing.startedAt === null) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Not started</span>
        {isFabricationOverdueToStart(job) ? (
          <Badge variant="outline">
            <IconAlertTriangle data-icon="inline-start" />
            Fabrication not started?
          </Badge>
        ) : null}
      </div>
    );
  }

  if (timing.completedAt === null) {
    return <div className="text-sm">Started {formatDate(timing.startedAt, 'short')}</div>;
  }

  const workingDays = timingWorkingDays(
    toPlantDateOnly(new Date(timing.startedAt)),
    toPlantDateOnly(new Date(timing.completedAt)),
    { orgOffDays: offDays },
  );

  return (
    <div className="text-sm">
      {formatDate(timing.startedAt, 'short')} → {formatDate(timing.completedAt, 'short')} ·{' '}
      {workingDays === 1 ? '1 day' : `${workingDays} days`}
      {timing.crew.length > 0 ? ` · ${timing.crew.map((member) => member.name).join(', ')}` : null}
    </div>
  );
};

const FabricationStampAction: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  if (timing.startedAt === null) {
    return <StartFabricationButton job={job} />;
  }

  if (timing.completedAt === null) {
    return <CompleteFabricationButton job={job} timing={timing} />;
  }

  return <CorrectFabricationButton job={job} timing={timing} />;
};

const StartFabricationButton: React.FC<{ job: JobDetail }> = ({ job }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const { invalidateJobs, invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const startMutation = useMutation(
    trpc.jobs.startDepartmentTiming.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to start fabrication.'),
      onSuccess: async () => {
        setIsOpen(false);
        await Promise.all([invalidateJobs(), invalidateProducts()]);
        toast.success('Fabrication started');
      },
    }),
  );

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger render={<Button size="sm" type="button" variant="outline" />}>Start fabrication</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start fabrication</DialogTitle>
          <DialogDescription>
            This records that fabrication work on {job.code} started now. It changes no schedule — correct it later if
            the time is wrong.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={startMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={startMutation.isPending}
            onClick={() => startMutation.mutate({ department: 'fabrication', id: job.id })}
            type="button"
          >
            Start fabrication
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const CompleteFabricationButton: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const { invalidateJobs, invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const crewOptions = useCrewOptions(isOpen, timing);
  const completeMutation = useMutation(
    trpc.jobs.completeDepartmentTiming.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to record fabrication as done.'),
    }),
  );

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="outline">
        Fabrication done
      </Button>
      <CreateEntityDialog
        defaultValues={{ crewUserIds: timing.suggestedCrew.map((member) => member.userId) }}
        description={
          // Corrections are refused on a completed Job, so this stamp is frozen the moment it lands.
          job.completedOn === null
            ? `Record fabrication on ${job.code} as done now, and name the Fabricators who crewed it.`
            : `Record fabrication on ${job.code} as done now, and name the Fabricators who crewed it. ${job.code} is already completed, so this cannot be corrected afterwards — check the names before saving.`
        }
        key={isOpen ? 'open' : 'closed'}
        onCreate={(values: DoneFormValues) =>
          completeMutation.mutateAsync({ crewUserIds: values.crewUserIds, department: 'fabrication', id: job.id })
        }
        onCreated={async () => {
          setIsOpen(false);
          await Promise.all([invalidateJobs(), invalidateProducts()]);
          toast.success('Fabrication done');
        }}
        onOpenChange={setIsOpen}
        open={isOpen}
        submitLabel="Fabrication done"
        title="Fabrication done"
        validator={DoneFormValues}
      >
        {(form) => (
          <form.AppField name="crewUserIds">
            {(field) => (
              <field.MultiComboboxField
                emptyMessage="No Bay Operators found."
                label="Fabricators"
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

const CorrectFabricationButton: React.FC<{ job: JobDetail; timing: JobDepartmentTiming }> = ({ job, timing }) => {
  const trpc = useTRPC();
  const [isOpen, setIsOpen] = useState(false);
  const { invalidateJobs, invalidateProducts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const crewOptions = useCrewOptions(isOpen, timing);
  const plantToday = getPlantDateNow();
  const updateMutation = useMutation(
    trpc.jobs.updateDepartmentTiming.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to correct the fabrication times.'),
    }),
  );

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size="sm" type="button" variant="outline">
        <IconPencil data-icon="inline-start" />
        Edit
      </Button>
      <CreateEntityDialog
        defaultValues={{
          completedOn: timing.completedAt ? toPlantDateOnly(new Date(timing.completedAt)) : '',
          crewUserIds: timing.crew.map((member) => member.userId),
          startedOn: timing.startedAt ? toPlantDateOnly(new Date(timing.startedAt)) : '',
        }}
        description="Correct what was stamped. Clearing the start date removes the fabrication stamps and their crew altogether."
        key={isOpen ? 'open' : 'closed'}
        onCreate={(values: CorrectionFormValues) =>
          updateMutation.mutateAsync({
            completedAt: values.completedOn ? DateIso.parse(values.completedOn) : null,
            // Crew only exists against a done stamp, so clearing the dates has to clear the crew with
            // them — otherwise the dialog's own "removes the stamps" path is refused by core.
            crewUserIds: values.completedOn ? values.crewUserIds : [],
            department: 'fabrication',
            id: job.id,
            startedAt: values.startedOn ? DateIso.parse(values.startedOn) : null,
          })
        }
        onCreated={async () => {
          setIsOpen(false);
          await Promise.all([invalidateJobs(), invalidateProducts()]);
          toast.success('Fabrication times updated');
        }}
        onOpenChange={setIsOpen}
        open={isOpen}
        submitLabel="Save times"
        title="Edit fabrication times"
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
                  label="Fabricators"
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

/**
 * The Bay Operator pool, offered only while a dialog is open. Every role that may stamp a Job today
 * also administers Bays, so this reuses the Bay operator list rather than minting a second read of
 * the same people.
 */
function useCrewOptions(enabled: boolean, timing: JobDepartmentTiming): { label: string; value: string }[] {
  const trpc = useTRPC();
  const operatorsQuery = useQuery(trpc.jobs.listBayOperators.queryOptions(undefined, { enabled }));
  const operators = operatorsQuery.data?.operators ?? [];
  const known = new Map(operators.map((operator) => [operator.id, operator.name]));

  // A recorded Fabricator whose role has since changed still has to render as a chip, or the dialog
  // would silently drop them from a crew the person is only editing the dates of.
  for (const member of timing.crew) {
    if (!known.has(member.userId)) known.set(member.userId, member.name);
  }

  return [...known.entries()].map(([value, label]) => ({ label, value }));
}

/** The same org Off-Day set the metrics count with, read off the shared Board query. */
function useOrgOffDays(): ReadonlySet<string> {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());

  return useMemo(() => new Set((baysQuery.data?.offDays ?? []).map((offDay) => offDay.date)), [baysQuery.data]);
}

/**
 * The forgotten-start nudge: fabrication was due to be on the floor by now and nobody said it
 * started. Derived from the Job's own projected schedule — nothing about it is stored. A Job that is
 * cancelled or already completed is nobody's to start, so it gets no nudge.
 */
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
