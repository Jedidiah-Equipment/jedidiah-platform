import { router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { FormPage } from '@/components/FormPage';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { CONTRACTING_TAB_HREF } from '@/contracting/lib/app-tabs';
import { newLocalId } from '@/contracting/lib/local-id';
import { recordFieldNoteCreated } from '@/contracting/observability';
import { confirm } from '@/lib/confirm';
import { FieldNoteFields } from './FieldNoteFields';
import { GALLERY_HINT } from './FieldNotePhotoStrip';
import { fieldNoteFiles } from './files';
import { choosePhotos, takePhoto } from './pick-photos';
import type { PickedPhoto } from './store';
import { useFieldNoteAction } from './use-field-note-action';
import { useFieldNotes } from './use-field-notes';

const PICK_FAILED = 'The photo could not be added. Try again.';
const backToNotes = () => router.replace(CONTRACTING_TAB_HREF.notes);

/** A draft in component state: nothing reaches storage, the sandbox, or the gallery until Save note. */
export default function NewFieldNoteScreen() {
  const { store } = useFieldNotes();
  const navigation = useNavigation();
  const showToast = useAppToast();
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<(PickedPhoto & { id: string })[]>([]);
  const [saved, setSaved] = useState(false);
  const { busy, error, act } = useFieldNoteAction();
  const limit = fieldNoteFiles.photoLimit;
  const hasContent = description.trim() !== '' || photos.length > 0;

  usePreventRemove(hasContent && !saved, ({ data }) => {
    // A save in flight would write the note after a discard; leaving waits for it.
    if (busy) return;
    void confirm({ title: 'Discard this Field Note?', confirmLabel: 'Discard', destructive: true }).then((discard) => {
      if (discard) navigation.dispatch(data.action);
    });
  });
  // Leave only once the guard above has re-rendered without the draft.
  useEffect(() => {
    if (saved) backToNotes();
  }, [saved]);

  const addPicked = (picked: PickedPhoto[]) =>
    setPhotos((current) => [...current, ...picked.map((photo) => ({ ...photo, id: newLocalId() }))].slice(0, limit));
  const pick = (source: () => Promise<PickedPhoto[]>) => act(async () => addPicked(await source()), PICK_FAILED);
  const save = () =>
    act(async () => {
      const { note, galleryFailed } = await store.create({ description, photos });
      recordFieldNoteCreated({
        hasPhoto: note.photos.length > 0,
        photoCount: note.photos.length,
        hasDescription: note.description.length > 0,
      });
      if (galleryFailed) showToast('success', `Field Note saved. ${GALLERY_HINT}`);
      setSaved(true);
    }, 'The Field Note could not be saved. Try again.');

  return (
    <FormPage
      toolbar={
        <SecondaryToolbar
          title="New Field Note"
          subtitle="CONTRACTING"
          parentLabel="Notes"
          onBack={() => {
            if (!busy) backToNotes();
          }}
          helpTopic="contractingMobileFieldNote"
        />
      }
      error={error}
      footer={
        <Button
          primary
          title={busy ? 'Saving…' : 'Save note'}
          disabled={busy || !hasContent}
          onPress={() => {
            void save();
          }}
        />
      }
    >
      <Text className="text-muted-foreground">
        Photograph the meter and write what management needs: the Machine Code, the farm, and the meter value if you can
        read it.
      </Text>
      <FieldNoteFields
        photos={photos}
        busy={busy}
        galleryHint={false}
        onTake={() => void pick(takePhoto)}
        onChoose={() => void pick(() => choosePhotos(limit - photos.length))}
        onRemovePhoto={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
        description={description}
        onDescriptionChange={setDescription}
        descriptionEditable={!busy}
      />
    </FormPage>
  );
}
