import { Text } from '@/components/ui/text';
import type { VoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { FieldNotePhotoStrip } from './FieldNotePhotoStrip';
import { fieldNoteFiles } from './files';
import { FIELD_NOTE_DESCRIPTION_MAX } from './store';

/** The photos and the description, as both the new-note draft and a kept note edit them. */
export function FieldNoteFields(props: {
  /** `uri` is already displayable. */
  photos: readonly { id: string; uri: string }[];
  busy: boolean;
  galleryHint: boolean;
  onTake: () => void;
  onChoose: () => void;
  onRemovePhoto: (photoId: string) => void;
  description: string;
  onDescriptionChange: (text: string) => void;
  onDescriptionBlur?: () => void;
  /** A draft locks while it saves; a kept note stays editable so a blur can commit it. */
  descriptionEditable: boolean;
  voice: VoiceSession;
}) {
  return (
    <>
      <FieldNotePhotoStrip
        photos={props.photos}
        limit={fieldNoteFiles.photoLimit}
        busy={props.busy}
        galleryHint={props.galleryHint}
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
        value={props.description}
        editable={props.descriptionEditable}
        rows={5}
        maxLength={FIELD_NOTE_DESCRIPTION_MAX}
        onChangeText={props.onDescriptionChange}
        onBlur={props.onDescriptionBlur}
        voice={props.voice}
      />
    </>
  );
}
