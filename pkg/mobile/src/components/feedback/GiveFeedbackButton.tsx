import { departmentLabels } from '@pkg/domain';
import { DEPARTMENTS, type FeedbackKind } from '@pkg/schema';
import { IconMessagePlus, IconX } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppForm } from '@/components/form';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useTRPC } from '@/lib/trpc';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';
import { FEEDBACK_DEFAULT_VALUES, FeedbackFormValues, toSubmitInput } from './types';

const KIND_OPTIONS: ReadonlyArray<{ label: string; value: FeedbackKind }> = [
  { label: 'General', value: 'general' },
  { label: 'Departments', value: 'corrective-feedback-department' },
  { label: 'Users', value: 'corrective-feedback-user' },
];

const DEPARTMENT_OPTIONS = DEPARTMENTS.map((department) => ({
  label: departmentLabels[department],
  value: department,
}));

/**
 * Mirror of web's `GiveFeedbackButton`, scoped to a Job: a footer trigger that
 * opens a full-screen form to submit feedback about this Job. Shown on both
 * single-Job surfaces (the Job detail pane and the Bay slot detail pane).
 */
export function GiveFeedbackButton({ jobCode, jobId }: { jobCode: string; jobId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        className="flex-row items-center justify-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 active:bg-muted"
        onPress={() => setOpen(true)}
      >
        <Icon className="text-foreground" icon={IconMessagePlus} size={18} />
        <Text className="text-sm text-foreground" weight="semibold">
          Send Feedback
        </Text>
      </Pressable>
      {/* Mount fresh each open so the form starts from defaults, mirroring web's remount-on-open. */}
      {open ? <FeedbackModal jobCode={jobCode} jobId={jobId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FeedbackModal({ jobCode, jobId, onClose }: { jobCode: string; jobId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const showToast = useAppToast();
  const { resolved } = useColorMode();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitMutation = useMutation(trpc.feedback.submit.mutationOptions());

  const form = useAppForm({
    defaultValues: FEEDBACK_DEFAULT_VALUES,
    validators: { onSubmit: FeedbackFormValues },
    onSubmit: async ({ value }) => {
      setSubmitError(null);
      try {
        await submitMutation.mutateAsync(toSubmitInput(value, jobId));
      } catch (error) {
        setSubmitError(toErrorMessage(error));
        return;
      }
      onClose();
      showToast('success', 'Feedback submitted');
    },
  });

  // Only fetch the corrective-user target list once that kind is chosen.
  const kind = useStore(form.store, (state) => state.values.kind);
  const targetUsersQuery = useQuery(
    trpc.feedback.listTargetUsers.queryOptions(undefined, { enabled: kind === 'corrective-feedback-user' }),
  );
  const userOptions = (targetUsersQuery.data?.users ?? []).map((user) => ({ label: user.name, value: user.id }));

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible>
      {/* RN Modal portals to a native root outside GluestackUIProvider, so re-apply the
          scheme's CSS variables on a wrapping view (semantic classes resolve against the
          parent var context) or the modal's tokens fall back to light. */}
      <View className="flex-1" style={gluestackConfig[resolved]}>
        <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
          <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
            <View className="min-w-0 flex-1">
              <Text className="text-lg text-foreground" weight="bold">
                Send feedback
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={1}>
                About{' '}
                <Text className="text-muted-foreground" mono>
                  {jobCode}
                </Text>{' '}
                · goes to the review queue
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

              <form.AppField name="kind">
                {(field) => <field.SegmentedField label="Who is this about?" options={KIND_OPTIONS} />}
              </form.AppField>

              <form.Subscribe selector={(state) => state.values.kind}>
                {(kind) =>
                  kind === 'corrective-feedback-department' ? (
                    <form.AppField name="departments">
                      {(field) => <field.MultiSelectField label="Departments" options={DEPARTMENT_OPTIONS} />}
                    </form.AppField>
                  ) : kind === 'corrective-feedback-user' ? (
                    <form.AppField name="userIds">
                      {(field) => (
                        <field.MultiSelectField
                          emptyMessage={targetUsersQuery.isPending ? 'Loading users…' : 'No users available.'}
                          label="Users"
                          options={userOptions}
                        />
                      )}
                    </form.AppField>
                  ) : null
                }
              </form.Subscribe>

              <form.AppField name="text">
                {(field) => <field.TextareaField label="Feedback" placeholder="Describe what you noticed…" rows={5} />}
              </form.AppField>
            </ScrollView>

            <View className="border-t border-border px-4 py-3">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSubmitting }}
                    className={`flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 ${isSubmitting ? 'opacity-60' : 'active:opacity-90'}`}
                    disabled={isSubmitting}
                    onPress={() => void form.handleSubmit()}
                  >
                    {isSubmitting ? <ActivityIndicator color="#0a0a0a" size="small" /> : null}
                    <Text className="text-sm text-primary-foreground" weight="semibold">
                      Submit feedback
                    </Text>
                  </Pressable>
                )}
              </form.Subscribe>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Unable to submit feedback. Please try again.';
}
