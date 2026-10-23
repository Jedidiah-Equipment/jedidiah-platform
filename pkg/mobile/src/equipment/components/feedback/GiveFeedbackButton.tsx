import { toSentenceCase } from '@pkg/domain';
import { departmentLabels, getFeedbackVisibilityNotice } from '@pkg/domain/equipment';
import { DEPARTMENTS, type FeedbackKind } from '@pkg/schema/equipment';
import { IconEye, IconLock, IconMessagePlus } from '@tabler/icons-react-native';
import { useStore } from '@tanstack/react-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useAppForm } from '@/components/form';
import { VoiceTextareaField } from '@/components/form/fields/VoiceTextareaField';
import { AccentButton } from '@/components/ui/accent-button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useVoiceSession } from '@/components/voice/use-voice-session';
import { useTRPC } from '@/lib/trpc';
import { useColorMode } from '@/theme/use-color-mode';
import { FeedbackModalFrame, FeedbackSubmitButton, feedbackErrorMessage } from './FeedbackModalFrame';
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
 * Mirror of web's `GiveFeedbackButton`, scoped to a Job: a trigger that opens a
 * full-screen form to submit feedback about this Job.
 */
export function GiveFeedbackButton({ jobCode, jobId }: { jobCode: string; jobId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <AccentButton icon={IconMessagePlus} label="Send Feedback" onPress={() => setOpen(true)} />
      {/* Mount fresh each open so the form starts from defaults, mirroring web's remount-on-open. */}
      {open ? <FeedbackModal jobCode={jobCode} jobId={jobId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function FeedbackModal({ jobCode, jobId, onClose }: { jobCode: string; jobId: string; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
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
        setSubmitError(feedbackErrorMessage(error));
        return;
      }
      voice.reportSaved();
      onClose();
      showToast('success', 'Feedback submitted');
      // General feedback is also Job Activity, so both subject views must see a new entry immediately.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.feedback.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.jobActivity.pathKey() }),
      ]);
    },
  });

  const text = useStore(form.store, (state) => state.values.text);
  const voice = useVoiceSession(
    { business: 'equipment', purpose: 'job feedback' },
    { value: text, onChangeText: (next) => form.setFieldValue('text', next) },
  );

  // Only fetch the corrective-user target list once that kind is chosen.
  const kind = useStore(form.store, (state) => state.values.kind);
  const targetUsersQuery = useQuery(
    trpc.feedback.listTargetUsers.queryOptions(undefined, { enabled: kind === 'corrective-feedback-user' }),
  );
  const userOptions = (targetUsersQuery.data?.users ?? []).map((user) => ({ label: user.name, value: user.id }));

  return (
    <FeedbackModalFrame
      about={
        <>
          About{' '}
          <Text className="text-muted-foreground" mono>
            {jobCode}
          </Text>{' '}
          · goes to the review queue
        </>
      }
      error={submitError}
      footer={
        <form.Subscribe
          selector={(state) => ({
            isSubmitting: state.isSubmitting,
            label: getFeedbackVisibilityNotice(state.values.kind, 'job').submitLabel,
          })}
        >
          {({ isSubmitting, label }) => (
            <FeedbackSubmitButton
              disabled={voice.busy}
              isSubmitting={isSubmitting}
              label={label}
              onPress={() => void form.handleSubmit()}
            />
          )}
        </form.Subscribe>
      }
      onClose={onClose}
    >
      <form.AppField name="kind">
        {(field) => <field.SegmentedField label="Who is this about?" options={KIND_OPTIONS} />}
      </form.AppField>

      <form.Subscribe selector={(state) => state.values.kind}>
        {(kind) => <FeedbackVisibilityBanner kind={kind} />}
      </form.Subscribe>

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
        {() => <VoiceTextareaField label="Feedback" placeholder="Describe what you noticed…" rows={5} voice={voice} />}
      </form.AppField>
    </FeedbackModalFrame>
  );
}

/**
 * Mirrors web's FeedbackVisibilityBanner, which owns these two tints. Each scheme's half is written
 * out on its own the way the shared badge palettes are: native picks one by name, and only a class
 * Tailwind scanned as its own literal has a rule behind it.
 */
const VISIBILITY_PALETTE = {
  private: {
    container: 'border-amber-500/50 bg-amber-500/10',
    textByScheme: { dark: 'text-amber-200', light: 'text-amber-800' },
  },
  public: {
    container: 'border-sky-500/50 bg-sky-500/10',
    textByScheme: { dark: 'text-sky-200', light: 'text-sky-800' },
  },
} as const;

/** Mobile mirror of web's FeedbackVisibilityBanner; this form is always Job-scoped. */
function FeedbackVisibilityBanner({ kind }: { kind: FeedbackKind }) {
  const notice = getFeedbackVisibilityNotice(kind, 'job');
  const isPublic = notice.visibility === 'public';
  const { resolved } = useColorMode();
  const palette = isPublic ? VISIBILITY_PALETTE.public : VISIBILITY_PALETTE.private;
  const textClassName = palette.textByScheme[resolved];

  return (
    <View className={`flex-row items-center gap-2.5 rounded-xl border px-3 py-2.5 ${palette.container}`}>
      <Icon className={textClassName} icon={isPublic ? IconEye : IconLock} size={18} />
      <View className="min-w-0 flex-1">
        <Text className={`text-xs ${textClassName}`}>
          <Text className={textClassName} weight="bold">
            {toSentenceCase(notice.title)}:{' '}
          </Text>
          {notice.description}
        </Text>
      </View>
    </View>
  );
}
