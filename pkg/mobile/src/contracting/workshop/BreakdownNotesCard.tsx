import { presentAction } from '@pkg/domain/contracting';
import { type BreakdownDetail, BreakdownNoteText } from '@pkg/schema/contracting';
import { useState } from 'react';
import { View } from 'react-native';
import { DateText } from '@/components/DateText';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useBusyAction } from '@/lib/use-busy-action';
import { BREAKDOWN_SAVE_FAILED, useBreakdownMutation } from './use-breakdowns';
import { VerdictButton } from './VerdictButton';

export function BreakdownNotesCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const add = useBreakdownMutation((breakdowns) => breakdowns.notes.add);
  const [text, setText] = useState('');
  const voice = useVoiceSession('breakdown note', {
    value: text,
    onChangeText: setText,
    maxLength: BreakdownNoteText.maxLength ?? undefined,
  });
  const { busy, error, run } = useBusyAction();
  const valid = BreakdownNoteText.safeParse(text).success;
  const addNote = presentAction(breakdown.actions.addNote);
  return (
    <Card title="Notes">
      {breakdown.notes.length ? (
        breakdown.notes.map((note) => (
          <View key={note.id} className="gap-1 border-b border-border pb-3">
            <Text className="text-sm text-muted-foreground">
              {note.authorName} ·{' '}
              <DateText className="text-sm text-muted-foreground" date={note.createdAt} format="medium" />
            </Text>
            <Text className="text-foreground">{note.text}</Text>
          </View>
        ))
      ) : (
        <Text className="text-muted-foreground">No notes yet.</Text>
      )}
      {addNote ? (
        <>
          {addNote.disabled ? null : (
            <VoiceTextArea
              accessibilityLabel="New note"
              placeholder="Ask or answer a question"
              editable={!busy}
              rows={3}
              voice={voice}
            />
          )}
          {error ? <Text className="text-danger">{error}</Text> : null}
          <VerdictButton
            verdict={breakdown.actions.addNote}
            title={busy ? 'Adding…' : 'Add note'}
            busy={busy || voice.busy || !valid}
            onPress={() =>
              void run(async () => {
                await add.mutateAsync({ breakdownId: breakdown.id, text });
                voice.reportSaved();
                setText('');
              }, BREAKDOWN_SAVE_FAILED)
            }
          />
        </>
      ) : null}
    </Card>
  );
}
