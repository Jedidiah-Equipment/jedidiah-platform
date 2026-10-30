import { Text } from '@/components/ui/text';
import type { VoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { PhotoStrip } from '@/contracting/components/PhotoStrip';
import { fieldNoteFiles } from './files';
import { FIELD_NOTE_DESCRIPTION_MAX } from './store';

/** The photos and the description, as both the new-note draft and a kept note edit them. */
export function FieldNoteFields(props: {
  /** `uri` is already displayable. */
  photos: readonly { id: string; uri: string }[];
  busy: boolean;
  onTake: () => void;
  onChoose: () => void;
  onRemovePhoto: (photoId: string) => void;
  onDescriptionBlur?: () => void;
  /** A draft locks while it saves; a kept note stays editable so a blur can commit it. */
  descriptionEditable: boolean;
  description: string;
  onDescriptionChange: (description: string) => void;
  /** The description's voice session, which follows its text. */
  voice: VoiceSession;
}) {
  return (
    <>
      <PhotoStrip
        noun="Field Note photo"
        photos={props.photos}
        limit={fieldNoteFiles.photoLimit}
        busy={props.busy}
        onTake={props.onTake}
        onChoose={props.onChoose}
        onRemove={props.onRemovePhoto}
      />
      <Text className="text-foreground" weight="semibold">
        Description
      </Text>
      <VoiceTextArea
        accessibilityLabel="Field Note description"
        placeholder="e.g. T12 at Rietfontein, meter 4211.5"
        editable={props.descriptionEditable}
        rows={5}
        onBlur={props.onDescriptionBlur}
        value={props.description}
        onChangeText={props.onDescriptionChange}
        maxLength={FIELD_NOTE_DESCRIPTION_MAX}
        voice={props.voice}
      />
    </>
  );
}
