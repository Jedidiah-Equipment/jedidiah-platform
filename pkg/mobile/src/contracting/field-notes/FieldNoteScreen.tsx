import { formatDate, statusBadgeColorClassNames } from '@pkg/domain';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FormPage } from '@/components/FormPage';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { CONTRACTING_TAB_HREF } from '@/contracting/lib/app-tabs';
import { recordFieldNoteChanged } from '@/contracting/observability';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { confirm } from '@/lib/confirm';
import { FieldNoteFields } from './FieldNoteFields';
import { fieldNoteFiles, resolveFieldNotePhotoUri } from './files';
import { choosePhotos, takePhoto } from './pick-photos';
import type { FieldNote, PickedPhoto } from './store';
import { useFieldNoteAction } from './use-field-note-action';
import { useFieldNotes } from './use-field-notes';

const backToNotes = () => router.replace(CONTRACTING_TAB_HREF.notes);

export default function FieldNoteScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  const { notes } = useFieldNotes();
  const note = notes?.find((candidate) => candidate.id === noteId);
  const [leaving, setLeaving] = useState(false);
  if (notes === null || leaving) return <SafeAreaView className="flex-1 bg-background" />;
  // Deleted on this phone, or a link to a note this operator never kept.
  if (!note) return <Redirect href={CONTRACTING_TAB_HREF.notes} />;
  return <FieldNoteDetail key={note.id} note={note} onLeave={() => setLeaving(true)} />;
}

/** Every edit applies at once: the description on blur or when the screen loses focus, the rest on tap. */
function FieldNoteDetail({ note, onLeave }: { note: FieldNote; onLeave: () => void }) {
  const { store } = useFieldNotes();
  const [description, setDescription] = useState(note.description);
  const [galleryHint, setGalleryHint] = useState(false);
  const { busy, error, act, report } = useFieldNoteAction();
  const voice = useVoiceSession('field note');
  const { reportSaved } = voice;
  const open = note.status === 'open';

  const latest = useRef({ description, stored: note.description, setDescription: store.setDescription });
  latest.current = { description, stored: note.description, setDescription: store.setDescription };
  const commitDescription = useCallback(() => {
    const { description, stored, setDescription: saveDescription } = latest.current;
    if (description.trim() === stored) return;
    // Not through `act`: a blur fired by tapping Close or a photo control must not swallow that tap.
    saveDescription(note.id, description).then(
      () => reportSaved(description.trim()),
      (error) => {
        setDescription(stored);
        report(error, 'The description could not be saved.');
      },
    );
  }, [report, reportSaved, note.id]);
  useFocusEffect(useCallback(() => commitDescription, [commitDescription]));
  useEffect(() => {
    setDescription(note.description);
  }, [note.description]);

  const add = (source: () => Promise<PickedPhoto[]>) =>
    act(async () => {
      const picked = await source();
      if (!picked.length) return;
      const { galleryFailed } = await store.addPhotos(note.id, picked);
      if (galleryFailed) setGalleryHint(true);
    }, 'The photo could not be added. Try again.');
  const removePhoto = async (photoId: string) => {
    const remove = await confirm({ title: 'Remove this photo?', confirmLabel: 'Remove', destructive: true });
    if (remove) await act(() => store.removePhoto(note.id, photoId), 'The photo could not be removed.');
  };
  const deleteNote = async () => {
    const remove = await confirm({
      title: 'Delete this Field Note?',
      message: 'Its photos stay in your gallery.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!remove) return;
    await act(async () => {
      await store.remove(note.id);
      recordFieldNoteChanged('deleted');
      onLeave();
      backToNotes();
    }, 'The Field Note could not be deleted.');
  };

  return (
    <FormPage
      toolbar={
        <SecondaryToolbar
          title="Field Note"
          subtitle={formatDate(note.createdAt, 'medium')}
          parentLabel="Notes"
          onBack={backToNotes}
          badge={
            <StatusBadge
              classNames={open ? statusBadgeColorClassNames.orange : statusBadgeColorClassNames.gray}
              label={open ? 'Open' : 'Closed'}
            />
          }
          helpTopic="contractingMobileFieldNote"
        />
      }
      error={error}
      footer={
        <View className="flex-row gap-2">
          {open ? null : (
            <View className="flex-1">
              <Button destructive title="Delete" disabled={busy} onPress={() => void deleteNote()} />
            </View>
          )}
          <View className="flex-1">
            <Button
              primary={open}
              title={open ? 'Close' : 'Reopen'}
              disabled={busy}
              onPress={() =>
                void act(async () => {
                  await (open ? store.close(note.id) : store.reopen(note.id));
                  recordFieldNoteChanged(open ? 'closed' : 'reopened');
                }, 'The Field Note could not be updated. Try again.')
              }
            />
          </View>
        </View>
      }
    >
      <FieldNoteFields
        photos={note.photos.map((photo) => ({ id: photo.id, uri: resolveFieldNotePhotoUri(photo.uri) }))}
        busy={busy}
        galleryHint={galleryHint}
        onTake={() => void add(takePhoto)}
        onChoose={() => void add(() => choosePhotos(fieldNoteFiles.photoLimit - note.photos.length))}
        onRemovePhoto={(photoId) => void removePhoto(photoId)}
        description={description}
        onDescriptionChange={setDescription}
        onDescriptionBlur={commitDescription}
        descriptionEditable
        voice={voice}
      />
    </FormPage>
  );
}
