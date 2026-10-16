import type { ActionVerdict } from '@pkg/domain/contracting';
import { NoteText } from '@pkg/schema/contracting';
import { IconX } from '@tabler/icons-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { VerdictButton } from '@/contracting/workshop/VerdictButton';
import { gluestackConfig } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';
import { type NoteThreadRef, useAddNote } from './use-add-note';

/** Add Note on a record's Activity thread, under that record's `addNote` verdict. */
export function AddNoteButton({ thread, verdict }: { thread: NoteThreadRef; verdict: ActionVerdict }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <VerdictButton primary verdict={verdict} title="Add Note" onPress={() => setOpen(true)} />
      {/* Mounted fresh each open, so the note and its voice session start empty. */}
      {open ? <NoteModal thread={thread} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NoteModal({ thread, onClose }: { thread: NoteThreadRef; onClose: () => void }) {
  const { resolved } = useColorMode();
  const [text, setText] = useState('');
  const { busy, error, send, voicePurpose } = useAddNote(thread);
  const voice = useVoiceSession(voicePurpose, {
    value: text,
    onChangeText: setText,
    maxLength: NoteText.maxLength ?? undefined,
  });
  const valid = NoteText.safeParse(text).success;
  const onSend = () =>
    void send(text, () => {
      voice.reportSaved();
      onClose();
    });

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
                  {thread.code}
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
                  onPress={onSend}
                />
              </View>
            </KeyboardAvoidingView>
          </SafeAreaView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}
