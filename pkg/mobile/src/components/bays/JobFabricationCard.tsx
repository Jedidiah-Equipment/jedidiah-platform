import { formatDate, toPlantDateOnly } from '@pkg/domain';
import { AuthId, DateIso, type JobDepartmentTiming } from '@pkg/schema';
import { IconPencil, IconX } from '@tabler/icons-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
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

import { useAppForm } from '@/components/form';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { useCan } from '@/lib/use-access';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

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
 * Fabrication's Department Timing stamps on the Job Detail screen — the first Job mutation on mobile.
 * Mirrors web's three states: not started, started, done. Hidden entirely without `job:update`, which
 * today's mobile Job readers do not hold; the stamps are an observation log and move no schedule.
 */
export function JobFabricationCard({
  isLocked,
  jobCode,
  jobId,
  timing,
}: {
  isLocked: boolean;
  jobCode: string;
  jobId: string;
  timing: JobDepartmentTiming;
}) {
  const canStamp = useCan('job:update').can && !isLocked;

  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
        Fabrication
      </Text>
      <Text className="mt-2 text-sm text-surface-foreground">{summarize(timing)}</Text>
      {canStamp ? <FabricationAction jobCode={jobCode} jobId={jobId} timing={timing} /> : null}
    </View>
  );
}

function summarize(timing: JobDepartmentTiming): string {
  if (timing.startedAt === null) return 'Not started';
  if (timing.completedAt === null) return `Started ${formatDate(timing.startedAt, 'd MMM')}`;

  const crew = timing.crew.map((member) => member.name).join(', ');
  const span = `${formatDate(timing.startedAt, 'd MMM')} – ${formatDate(timing.completedAt, 'd MMM')}`;

  return crew ? `${span} · ${crew}` : span;
}

function FabricationAction({
  jobCode,
  jobId,
  timing,
}: {
  jobCode: string;
  jobId: string;
  timing: JobDepartmentTiming;
}) {
  const [openDialog, setOpenDialog] = useState<'done' | 'edit' | null>(null);
  const invalidate = useJobInvalidation();
  const showToast = useAppToast();
  const trpc = useTRPC();
  const startMutation = useMutation(trpc.jobs.startDepartmentTiming.mutationOptions());

  if (timing.startedAt === null) {
    return (
      <ActionButton
        label="Start fabrication"
        onPress={() =>
          Alert.alert('Start fabrication', `Record that fabrication on ${jobCode} started now?`, [
            { style: 'cancel', text: 'Cancel' },
            {
              onPress: () => {
                startMutation.mutate(
                  { department: 'fabrication', id: jobId },
                  {
                    onError: (error) => showToast('error', toErrorMessage(error, 'Unable to start fabrication.')),
                    onSuccess: async () => {
                      await invalidate();
                      showToast('success', 'Fabrication started');
                    },
                  },
                );
              },
              text: 'Start',
            },
          ])
        }
        pending={startMutation.isPending}
      />
    );
  }

  if (timing.completedAt === null) {
    return (
      <>
        <ActionButton label="Fabrication done" onPress={() => setOpenDialog('done')} pending={false} />
        {openDialog === 'done' ? (
          <DoneModal jobCode={jobCode} jobId={jobId} onClose={() => setOpenDialog(null)} timing={timing} />
        ) : null}
      </>
    );
  }

  return (
    <>
      <ActionButton icon label="Edit times" onPress={() => setOpenDialog('edit')} pending={false} />
      {openDialog === 'edit' ? (
        <CorrectionModal jobCode={jobCode} jobId={jobId} onClose={() => setOpenDialog(null)} timing={timing} />
      ) : null}
    </>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  pending,
}: {
  icon?: boolean;
  label: string;
  onPress: () => void;
  pending: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      className={`mt-3 flex-row items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 ${pending ? 'opacity-60' : 'active:opacity-70'}`}
      disabled={pending}
      onPress={onPress}
    >
      {pending ? <ActivityIndicator size="small" /> : null}
      {icon ? <Icon className="text-muted-foreground" icon={IconPencil} size={16} /> : null}
      <Text className="text-sm text-foreground" weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}

function DoneModal({
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
  const completeMutation = useMutation(trpc.jobs.completeDepartmentTiming.mutationOptions());

  const form = useAppForm({
    defaultValues: { crewUserIds: timing.suggestedCrew.map((member) => member.userId) } satisfies DoneFormValues,
    validators: { onSubmit: DoneFormValues },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await completeMutation.mutateAsync({
          crewUserIds: value.crewUserIds,
          department: 'fabrication',
          id: jobId,
        });
      } catch (error) {
        setSubmitError(toErrorMessage(error, 'Unable to record fabrication as done.'));
        return;
      }
      onClose();
      await invalidate();
      showToast('success', 'Fabrication done');
    },
  });

  return (
    <StampModal
      onClose={onClose}
      onSubmit={() => void form.handleSubmit()}
      subtitle={`${jobCode} · fabrication done now`}
      submitLabel="Fabrication done"
      submitting={form.state.isSubmitting}
      submitError={submitError}
      title="Fabrication done"
    >
      <form.AppField name="crewUserIds">
        {(field) => (
          <field.MultiSelectField
            emptyMessage="No Bay Operators available."
            label="Fabricators"
            options={crewOptions}
          />
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
          crewUserIds: value.crewUserIds,
          department: 'fabrication',
          id: jobId,
          startedAt: value.startedOn ? DateIso.parse(value.startedOn) : null,
        });
      } catch (error) {
        setSubmitError(toErrorMessage(error, 'Unable to correct the fabrication times.'));
        return;
      }
      onClose();
      await invalidate();
      showToast('success', 'Fabrication times updated');
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
      title="Edit fabrication times"
    >
      <form.AppField name="startedOn">
        {(field) => <field.DateField label="Started" placeholder="Not started" />}
      </form.AppField>
      <form.AppField name="completedOn">
        {(field) => <field.DateField label="Done" placeholder="Not done" />}
      </form.AppField>
      <form.AppField name="crewUserIds">
        {(field) => (
          <field.MultiSelectField
            emptyMessage="No Bay Operators available."
            label="Fabricators"
            options={crewOptions}
          />
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

  // A recorded Fabricator whose role has since changed still has to render, or editing the dates
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
