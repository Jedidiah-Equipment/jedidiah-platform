import { formatDate, getFirstName, getPlantDateNow, statusBadgeColorClassNames, toPlantDateOnly } from '@pkg/domain';
import {
  DEPARTMENT_TIMING_STATUS,
  type DepartmentTimingState,
  departmentCrewLabels,
  departmentLabels,
  getDepartmentTimingPresentation,
} from '@pkg/domain/equipment';
import { DateIso, DateOnlyIsoString } from '@pkg/schema';
import {
  type JobDepartmentTiming,
  JobDepartmentTimingCompleteInput,
  JobDepartmentTimingCorrectionValues,
} from '@pkg/schema/equipment';
import { IconCircleCheck, IconPencil, IconPlayerPlay } from '@tabler/icons-react-native';
import { revalidateLogic } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { z } from 'zod';

import { Avatar } from '@/components/Avatar';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { AccentButton } from '@/components/ui/accent-button';
import { CardCollapse } from '@/components/ui/card-collapse';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { FactField, FactRow } from '@/equipment/components/bays/job-facts';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';

const DoneFormValues = z.object({ crewUserIds: JobDepartmentTimingCompleteInput.shape.crewUserIds });
type DoneFormValues = z.infer<typeof DoneFormValues>;

const CorrectionFormValues = z
  .object({
    completedOn: z.union([DateOnlyIsoString, z.literal('')]),
    crewUserIds: JobDepartmentTimingCorrectionValues.shape.crewUserIds,
    startedOn: z.union([DateOnlyIsoString, z.literal('')]),
  })
  .superRefine((value, ctx) => {
    const result = JobDepartmentTimingCorrectionValues.safeParse({
      completedOn: value.completedOn || null,
      crewUserIds: value.crewUserIds,
      startedOn: value.startedOn || null,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path });
      }
    }
  });
type CorrectionFormValues = z.infer<typeof CorrectionFormValues>;

/**
 * One Department's Timing stamps on the Job Detail screen. The same collapsible card handles every
 * work Department; stamps remain an observation log and move no schedule.
 */
export function JobDepartmentTimingCard({
  isCancelled,
  isCompleted,
  jobCode,
  jobId,
  onOpenChange,
  open,
  timing,
}: {
  isCancelled: boolean;
  isCompleted: boolean;
  jobCode: string;
  jobId: string;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
  timing: JobDepartmentTiming;
}) {
  const canUpdate = useCan('equipment_job:update').can;
  const offDays = useOrgOffDays(timing.completedAt !== null);
  // A completed Job still accepts the one stamp that closes an observation already open, mirroring
  // core and web exactly: the completion sweep latches `completedOn` the day after the last Slot
  // ends, so Department work that overran its Slot would otherwise have no way to record that it finished.
  const hasOpenObservation = timing.startedAt !== null && timing.completedAt === null;
  const canStamp = canUpdate && !isCancelled && (!isCompleted || hasOpenObservation);
  const presentation = getDepartmentTimingPresentation({
    department: timing.department,
    timing,
    today: getPlantDateNow(),
    workingCalendar: { orgOffDays: offDays },
  });
  const duration = presentation.durationDays;

  return (
    <CardCollapse
      headerAccessory={<DepartmentTimingStatusBadge state={presentation.state} />}
      onOpenChange={onOpenChange}
      open={open}
      title={departmentLabels[timing.department]}
    >
      <View className="gap-4">
        <Text className="text-sm leading-5 text-surface-foreground" weight="semibold">
          {presentation.headline}
        </Text>
        <View className="-mx-4 h-px bg-border" />

        <FactRow className="gap-0">
          <FactField className="pr-2" label="STARTED" value={formatDate(timing.startedAt, 'short', '—')} />
          <FactField
            className="border-l border-border px-2"
            label="FINISHED"
            value={formatDate(timing.completedAt, 'short', '—')}
          />
          <FactField
            className="border-l border-border pl-2"
            label="DURATION"
            value={duration === null ? '—' : `${duration} ${duration === 1 ? 'day' : 'days'}`}
          />
        </FactRow>

        {presentation.state === 'complete' && timing.crew.length > 0 ? (
          <>
            <View className="-mx-4 h-px bg-border" />
            <View className="gap-2.5">
              <Text className="text-[10px] uppercase tracking-wide text-muted-foreground">CREW</Text>
              <View className="flex-row flex-wrap gap-x-4 gap-y-2">
                {timing.crew.map((member) => (
                  <View className="flex-row items-center gap-2" key={member.userId}>
                    <Avatar className="h-7 w-7 rounded-full" name={member.name} uri={null} />
                    <Text className="text-sm text-surface-foreground" weight="semibold">
                      {getFirstName(member.name)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {canStamp ? (
          <DepartmentTimingAction isCompleted={isCompleted} jobCode={jobCode} jobId={jobId} timing={timing} />
        ) : null}
      </View>
    </CardCollapse>
  );
}

function DepartmentTimingStatusBadge({ state }: { state: DepartmentTimingState }) {
  const status = DEPARTMENT_TIMING_STATUS[state];
  const color = statusBadgeColorClassNames[status.color];

  return <StatusBadge classNames={color} label={status.label} />;
}

function DepartmentTimingAction({
  isCompleted,
  jobCode,
  jobId,
  timing,
}: {
  isCompleted: boolean;
  jobCode: string;
  jobId: string;
  timing: JobDepartmentTiming;
}) {
  const [openDialog, setOpenDialog] = useState<'done' | 'edit' | null>(null);
  const invalidate = useJobInvalidation();
  const showToast = useAppToast();
  const trpc = useTRPC();
  const startMutation = useMutation(trpc.jobs.startDepartmentTiming.mutationOptions());
  const departmentLabel = departmentLabels[timing.department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();

  if (timing.startedAt === null) {
    return (
      <AccentButton
        icon={IconPlayerPlay}
        label={`Start ${lowerDepartmentLabel}`}
        onPress={() =>
          Alert.alert(
            `Start ${lowerDepartmentLabel}`,
            `Record that ${lowerDepartmentLabel} on ${jobCode} started now?`,
            [
              { style: 'cancel', text: 'Cancel' },
              {
                onPress: () => {
                  startMutation.mutate(
                    { department: timing.department, id: jobId },
                    {
                      onError: (error) =>
                        showToast('error', toErrorMessage(error, `Unable to start ${lowerDepartmentLabel}.`)),
                      onSuccess: async () => {
                        await invalidate();
                        showToast('success', `${departmentLabel} started`);
                      },
                    },
                  );
                },
                text: 'Start',
              },
            ],
          )
        }
        pending={startMutation.isPending}
      />
    );
  }

  if (timing.completedAt === null) {
    return (
      <>
        <AccentButton icon={IconCircleCheck} label={`${departmentLabel} done`} onPress={() => setOpenDialog('done')} />
        {openDialog === 'done' ? (
          <DoneModal
            isCompleted={isCompleted}
            jobCode={jobCode}
            jobId={jobId}
            onClose={() => setOpenDialog(null)}
            timing={timing}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <AccentButton icon={IconPencil} label="Edit times" onPress={() => setOpenDialog('edit')} />
      {openDialog === 'edit' ? (
        <CorrectionModal jobCode={jobCode} jobId={jobId} onClose={() => setOpenDialog(null)} timing={timing} />
      ) : null}
    </>
  );
}

function DoneModal({
  isCompleted,
  jobCode,
  jobId,
  onClose,
  timing,
}: {
  isCompleted: boolean;
  jobCode: string;
  jobId: string;
  onClose: () => void;
  timing: JobDepartmentTiming;
}) {
  const trpc = useTRPC();
  const invalidate = useJobInvalidation();
  const showToast = useAppToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const crewOptions = useCrewOptions(timing);
  const completeMutation = useMutation(trpc.jobs.completeDepartmentTiming.mutationOptions());
  const departmentLabel = departmentLabels[timing.department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();
  const crewLabel = departmentCrewLabels[timing.department].plural;

  const form = useAppForm({
    defaultValues: { crewUserIds: timing.suggestedCrew.map((member) => member.userId) } satisfies DoneFormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: DoneFormValues },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await completeMutation.mutateAsync({
          crewUserIds: value.crewUserIds,
          department: timing.department,
          id: jobId,
        });
      } catch (error) {
        setSubmitError(toErrorMessage(error, `Unable to record ${lowerDepartmentLabel} as done.`));
        return;
      }
      onClose();
      await invalidate();
      showToast('success', `${departmentLabel} done`);
    },
  });

  return (
    <ModalSheet
      error={submitError}
      footer={
        <SheetSubmitButton
          isSubmitting={form.state.isSubmitting}
          label={`${departmentLabel} done`}
          onPress={() => void form.handleSubmit()}
        />
      }
      onClose={onClose}
      subtitle={
        // Corrections are refused on a completed Job, so this stamp is frozen the moment it lands.
        isCompleted
          ? `${jobCode} · already completed, so this cannot be corrected`
          : `${jobCode} · ${lowerDepartmentLabel} done now`
      }
      title={`${departmentLabel} done`}
    >
      <form.AppField name="crewUserIds">
        {(field) => (
          <field.MultiSelectField emptyMessage="No Bay Operators available." label={crewLabel} options={crewOptions} />
        )}
      </form.AppField>
    </ModalSheet>
  );
}

function CorrectionModal({
  jobCode,
  jobId,
  onClose,
  timing,
}: {
  jobCode: string;
  jobId: string;
  onClose: () => void;
  timing: JobDepartmentTiming;
}) {
  const trpc = useTRPC();
  const invalidate = useJobInvalidation();
  const showToast = useAppToast();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const crewOptions = useCrewOptions(timing);
  const updateMutation = useMutation(trpc.jobs.updateDepartmentTiming.mutationOptions());
  const departmentLabel = departmentLabels[timing.department];
  const lowerDepartmentLabel = departmentLabel.toLowerCase();
  const crewLabel = departmentCrewLabels[timing.department].plural;

  const form = useAppForm({
    defaultValues: {
      completedOn: timing.completedAt ? toPlantDateOnly(new Date(timing.completedAt)) : '',
      crewUserIds: timing.crew.map((member) => member.userId),
      startedOn: timing.startedAt ? toPlantDateOnly(new Date(timing.startedAt)) : '',
    } satisfies CorrectionFormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: CorrectionFormValues },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await updateMutation.mutateAsync({
          completedAt: value.completedOn ? DateIso.parse(value.completedOn) : null,
          // Crew only exists against a done stamp, so clearing the dates has to clear the crew with
          // them — otherwise the dialog's own "removes the stamps" path is refused by core.
          crewUserIds: value.completedOn ? value.crewUserIds : [],
          department: timing.department,
          id: jobId,
          startedAt: value.startedOn ? DateIso.parse(value.startedOn) : null,
        });
      } catch (error) {
        setSubmitError(toErrorMessage(error, `Unable to correct the ${lowerDepartmentLabel} times.`));
        return;
      }
      onClose();
      await invalidate();
      showToast('success', `${departmentLabel} times updated`);
    },
  });

  return (
    <ModalSheet
      error={submitError}
      footer={
        <SheetSubmitButton
          isSubmitting={form.state.isSubmitting}
          label={'Save times'}
          onPress={() => void form.handleSubmit()}
        />
      }
      onClose={onClose}
      subtitle={`${jobCode} · clearing the start date removes the stamps`}
      title={`Edit ${lowerDepartmentLabel} times`}
    >
      <form.AppField name="startedOn">
        {(field) => <field.DateField label="Started" placeholder="Not started" />}
      </form.AppField>
      <form.AppField name="completedOn">
        {(field) => <field.DateField label="Done" placeholder="Not done" />}
      </form.AppField>
      <form.AppField name="crewUserIds">
        {(field) => (
          <field.MultiSelectField emptyMessage="No Bay Operators available." label={crewLabel} options={crewOptions} />
        )}
      </form.AppField>
    </ModalSheet>
  );
}

/**
 * The Bay Operator pool. Every role that may stamp a Job also administers Bays today, so this reuses
 * the Bay operator list rather than minting a second read of the same people.
 */
function useCrewOptions(timing: JobDepartmentTiming): { label: string; value: string }[] {
  const trpc = useTRPC();
  const operatorsQuery = useQuery(trpc.jobs.listBayOperators.queryOptions());
  const known = new Map((operatorsQuery.data?.operators ?? []).map((operator) => [operator.id, operator.name]));

  // A recorded crew member whose role has since changed still has to render, or editing the dates
  // would silently drop them from the crew.
  for (const member of timing.crew) {
    if (!known.has(member.userId)) known.set(member.userId, member.name);
  }

  return [...known.entries()].map(([value, label]) => ({ label, value }));
}

function useJobInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  return () => queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() });
}

function useOrgOffDays(enabled: boolean): ReadonlySet<string> {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled }));

  return useMemo(() => new Set((baysQuery.data?.offDays ?? []).map((offDay) => offDay.date)), [baysQuery.data]);
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
