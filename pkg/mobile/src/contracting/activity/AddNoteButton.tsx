import type { ActionVerdict } from '@pkg/domain/contracting';
import { NoteText } from '@pkg/schema/contracting';
import { IconMessagePlus } from '@tabler/icons-react-native';
import { useState } from 'react';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { AccentButton } from '@/components/ui/accent-button';
import { Text } from '@/components/ui/text';
import { useVoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { VerdictGroup } from '@/contracting/workshop/VerdictButton';
import { type NoteThreadRef, useAddNote } from './use-add-note';

/** Add Note on a record's Activity thread, under that record's `addNote` verdict. */
export function AddNoteButton({ thread, verdict }: { thread: NoteThreadRef; verdict: ActionVerdict }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <VerdictGroup verdict={verdict}>
        {(disabled) => (
          <AccentButton disabled={disabled} icon={IconMessagePlus} label="Add Note" onPress={() => setOpen(true)} />
        )}
      </VerdictGroup>
      {/* Mounted fresh each open, so the note and its voice session start empty. */}
      {open ? <NoteModal thread={thread} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function NoteModal({ thread, onClose }: { thread: NoteThreadRef; onClose: () => void }) {
  const [text, setText] = useState('');
  const { busy, error, send, voicePurpose } = useAddNote(thread);
  const voice = useVoiceSession({ business: 'contracting', purpose: voicePurpose });
  const valid = NoteText.safeParse(text).success;
  const onSend = () =>
    void send(text, () => {
      voice.reportSaved();
      onClose();
    });

  return (
    <ModalSheet
      title="Add Note"
      subtitle={
        <Text className="text-xs text-muted-foreground" mono>
          {thread.code}
        </Text>
      }
      error={error}
      footer={<SheetSubmitButton disabled={voice.busy || !valid} isSubmitting={busy} label="Send" onPress={onSend} />}
      onClose={onClose}
    >
      <VoiceTextArea
        accessibilityLabel="Note"
        placeholder="Ask, answer or tell the team something"
        editable={!busy}
        rows={5}
        value={text}
        onChangeText={setText}
        maxLength={NoteText.maxLength ?? undefined}
        voice={voice}
      />
    </ModalSheet>
  );
}
