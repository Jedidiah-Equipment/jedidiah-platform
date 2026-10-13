import { type BreakdownDetail, BreakdownNoteText, type JobDetail, JobNoteText } from '@pkg/schema/contracting';
import { IconX } from '@tabler/icons-react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { VerdictButton } from '@/contracting/workshop/VerdictButton';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

const NOTE_SAVE_FAILED = 'Could not add the note. Check your connection and try again.';

type NoteSubject =
  | { job: Pick<JobDetail, 'id' | 'jobNumber' | 'actions'>; breakdown?: never }
  | { breakdown: Pick<BreakdownDetail, 'id' | 'subject' | 'actions'>; job?: never };

/** Add Note on a Job's or a Breakdown's Activity thread, under that record's `addNote` verdict. */
export function AddNoteButton(subject: NoteSubject) {
  const [open, setOpen] = useState(false);
  const verdict = subject.job ? subject.job.actions.addNote : subject.breakdown.actions.addNote;
  return (
    <>
      <VerdictButton primary verdict={verdict} title="Add Note" onPress={() => setOpen(true)} />
      {/* Mounted fresh each open, so the note and its voice session start empty. */}
      {open ? <NoteModal subject={subject} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NoteModal({ subject, onClose }: { subject: NoteSubject; onClose: () => void }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showToast = useAppToast();
  const { resolved } = useColorMode();
  const [text, setText] = useState('');
  const schema = subject.job ? JobNoteText : BreakdownNoteText;
  const voice = useVoiceSession(subject.job ? 'job note' : 'breakdown note', {
    value: text,
    onChangeText: setText,
    maxLength: schema.maxLength ?? undefined,
  });
  const addJobNote = useMutation(trpc.contractingJobs.notes.add.mutationOptions());
  const addBreakdownNote = useMutation(trpc.contractingBreakdowns.notes.add.mutationOptions());
  const { busy, error, run } = useBusyAction();
  const valid = schema.safeParse(text).success;
  const about = subject.job ? subject.job.jobNumber : subject.breakdown.subject.code;
  const send = () =>
    void run(async () => {
      if (subject.job) await addJobNote.mutateAsync({ jobId: subject.job.id, text });
      else await addBreakdownNote.mutateAsync({ breakdownId: subject.breakdown.id, text });
      voice.reportSaved();
      onClose();
      showToast('success', 'Note added');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.contractingActivity.pathKey() }),
        queryClient.invalidateQueries({
          queryKey: subject.job ? trpc.contractingJobs.pathKey() : trpc.contractingBreakdowns.pathKey(),
        }),
      ]);
    }, NOTE_SAVE_FAILED);

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent={false} visible>
      {/* The Modal portals outside the theme and safe-area providers, so both are re-applied here. */}
      <SafeAreaProvider>
        <View className="flex-1" style={gluestackConfig[resolved]}>
          <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom', 'left', 'right']}>
            <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
              <View className="min-w-0 flex-1">
                <Text className="text-lg text-foreground" weight="bold">
                  Add Note
                </Text>
                <Text className="text-xs text-muted-foreground" numberOfLines={1} mono>
                  {about}
                </Text>
              </View>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" className="p-1" onPress={onClose}>
                <Icon className="text-muted-foreground" icon={IconX} size={22} />
              </Pressable>
            </View>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
              <ScrollView contentContainerClassName="gap-4 px-4 pb-6 pt-4" keyboardShouldPersistTaps="handled">
                <VoiceTextArea
                  accessibilityLabel="Note"
                  placeholder="Ask, answer or tell the team something"
                  editable={!busy}
                  rows={5}
                  voice={voice}
                />
                {error ? <Text className="text-danger">{error}</Text> : null}
              </ScrollView>
              <View className="border-t border-border px-4 py-3">
                <Button
                  primary
                  title={busy ? 'Sending…' : 'Send'}
                  disabled={busy || voice.busy || !valid}
                  onPress={send}
                />
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
