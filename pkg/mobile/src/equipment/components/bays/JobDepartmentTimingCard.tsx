import {
  DEPARTMENT_TIMING_STATUS,
  type DepartmentTimingState,
  departmentCrewLabels,
  departmentLabels,
  formatDate,
  getDepartmentTimingPresentation,
  getFirstName,
  getPlantDateNow,
  statusBadgeColorClassNames,
  toPlantDateOnly,
} from '@pkg/domain';
import {
  DateIso,
  DateOnlyIsoString,
  type JobDepartmentTiming,
  JobDepartmentTimingCompleteInput,
  JobDepartmentTimingCorrectionValues,
} from '@pkg/schema';
import { IconCircleCheck, IconPencil, IconPlayerPlay, IconX } from '@tabler/icons-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { Avatar } from '@/components/Avatar';
import { useAppForm } from '@/components/form';
import { AccentButton } from '@/components/ui/accent-button';
import { CardCollapse } from '@/components/ui/card-collapse';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { FactField, FactRow } from '@/equipment/components/bays/job-facts';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

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
          <FactField className="pr-2" label="STARTED" value={formatDate(timing.startedAt, 'd MMM yyyy', '—')} />
          <FactField
            className="border-l border-border px-2"
            label="FINISHED"
            value={formatDate(timing.completedAt, 'd MMM yyyy', '—')}
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
    validators: { onSubmit: DoneFormValues },
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
    <StampModal
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      subtitle={
        // Corrections are refused on a completed Job, so this stamp is frozen the moment it lands.
        isCompleted
          ? `${jobCode} · already completed, so this cannot be corrected`
          : `${jobCode} · ${lowerDepartmentLabel} done now`
      }
      submitLabel={`${departmentLabel} done`}
      submitting={form.state.isSubmitting}
      submitError={submitError}
      title={`${departmentLabel} done`}
    >
      <form.AppField name="crewUserIds">
        {(field) => (
          <field.MultiSelectField emptyMessage="No Bay Operators available." label={crewLabel} options={crewOptions} />
        )}
      </form.AppField>
    </StampModal>
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
    validators: { onSubmit: CorrectionFormValues },
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
    <StampModal
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      subtitle={`${jobCode} · clearing the start date removes the stamps`}
      submitLabel="Save times"
      submitting={form.state.isSubmitting}
      submitError={submitError}
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
    </StampModal>
  );
}

/** The full-screen form shell both stamp dialogs share, mirroring the mobile feedback modal. */
function StampModal({
  children,
  onClose,
  onSubmit,
  submitError,
  submitLabel,
  submitting,
  subtitle,
  title,
}: {
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitError: string | null;
  submitLabel: string;
  submitting: boolean;
  subtitle: string;
  title: string;
}) {
  const { resolved } = useColorMode();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible>
      {/* RN Modal portals outside the provider tree, so the scheme's CSS variables and the safe-area
          insets are both re-applied here — the same shape the feedback modal uses. */}
      <SafeAreaProvider>
        <View className="flex-1" style={gluestackConfig[resolved]}>
          <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <View className="min-w-0 flex-1">
                <Text className="text-lg text-foreground" weight="bold">
                  {title}
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                  {subtitle}
                </Text>
              </View>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" className="p-1" onPress={onClose}>
                <Icon className="text-muted-foreground" icon={IconX} size={22} />
              </Pressable>
            </View>

            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
              <ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-4" keyboardShouldPersistTaps="handled">
                {submitError ? (
                  <View className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5">
                    <Text className="text-sm text-danger">{submitError}</Text>
                  </View>
                ) : null}
                {children}
              </ScrollView>

              <View className="border-t border-border px-4 py-3">
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: submitting }}
                  className={`flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 ${submitting ? 'opacity-60' : 'active:opacity-90'}`}
                  disabled={submitting}
                  onPress={onSubmit}
                >
                  {submitting ? <ActivityIndicator color="#0a0a0a" size="small" /> : null}
                  <Text className="text-sm text-primary-foreground" weight="semibold">
                    {submitLabel}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
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
