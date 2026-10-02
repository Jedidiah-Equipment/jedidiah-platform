import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
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
      <TextInput
        accessibilityLabel="Field Note description"
        placeholder="e.g. T12 at Rietfontein, meter 4211.5"
        value={props.description}
        editable={props.descriptionEditable}
        multiline
        maxLength={FIELD_NOTE_DESCRIPTION_MAX}
        onChangeText={props.onDescriptionChange}
        onBlur={props.onDescriptionBlur}
        className="min-h-28"
        textAlignVertical="top"
      />
    </>
  );
}
