import { formatDate, statusBadgeColorClassNames } from '@pkg/domain';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { CONTRACTING_TAB_HREF } from '@/contracting/lib/app-tabs';
import { choosePhotos, type PickedPhoto, takePhoto } from '@/contracting/lib/photo-picker';
import { confirm } from '@/lib/confirm';
import { FieldNotePhotoStrip } from './FieldNotePhotoStrip';
import { useFieldNotes } from './FieldNotesProvider';
import { fieldNoteFiles, resolveFieldNotePhotoUri } from './files';
import { FIELD_NOTE_DESCRIPTION_MAX, type FieldNote } from './store';
import { useFieldNoteAction } from './use-field-note-action';

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
  const notes = useFieldNotes();
  const { bottom } = useSafeAreaInsets();
  const [description, setDescription] = useState(note.description);
  const [galleryHint, setGalleryHint] = useState(false);
  const { busy, error, act } = useFieldNoteAction();
  const open = note.status === 'open';

  const latest = useRef({ description, stored: note.description, setDescription: notes.setDescription });
  latest.current = { description, stored: note.description, setDescription: notes.setDescription };
  const commitDescription = useCallback(() => {
    const { description, stored, setDescription: store } = latest.current;
    if (description.trim() === stored) return;
    void act(async () => {
      try {
        await store(note.id, description);
      } catch (error) {
        setDescription(stored);
        throw error;
      }
    }, 'The description could not be saved.');
  }, [act, note.id]);
  useFocusEffect(useCallback(() => commitDescription, [commitDescription]));
  useEffect(() => {
    setDescription(note.description);
  }, [note.description]);

  const add = (source: () => Promise<PickedPhoto[]>) =>
    act(async () => {
      const picked = await source();
      if (!picked.length) return;
      const { galleryFailed } = await notes.addPhotos(note.id, picked);
      if (galleryFailed) setGalleryHint(true);
    }, 'The photo could not be added. Try again.');
  const removePhoto = async (photoId: string) => {
    const remove = await confirm({ title: 'Remove this photo?', confirmLabel: 'Remove', destructive: true });
    if (remove) await act(() => notes.removePhoto(note.id, photoId), 'The photo could not be removed.');
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
      await notes.remove(note.id);
      onLeave();
      backToNotes();
    }, 'The Field Note could not be deleted.');
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <FieldNotePhotoStrip
            photos={note.photos.map((photo) => ({ id: photo.id, uri: resolveFieldNotePhotoUri(photo.uri) }))}
            limit={fieldNoteFiles.photoLimit}
            busy={busy}
            galleryHint={galleryHint}
            onTake={() => void add(takePhoto)}
            onChoose={() => void add(() => choosePhotos(fieldNoteFiles.photoLimit - note.photos.length))}
            onRemove={(photoId) => void removePhoto(photoId)}
          />
          <Text className="text-foreground" weight="semibold">
            Description
          </Text>
          <TextInput
            accessibilityLabel="Field Note description"
            placeholder="e.g. T12 at Rietfontein, meter 4211.5"
            value={description}
            multiline
            maxLength={FIELD_NOTE_DESCRIPTION_MAX}
            onChangeText={setDescription}
            onBlur={commitDescription}
            className="min-h-28"
            textAlignVertical="top"
          />
          <Button title="Delete" disabled={busy} onPress={() => void deleteNote()} />
        </ScrollView>
        <View
          className="gap-2 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 16) }}
        >
          {error ? (
            <Text className="text-danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            primary={open}
            title={open ? 'Close' : 'Reopen'}
            disabled={busy}
            onPress={() =>
              void act(
                () => (open ? notes.close(note.id) : notes.reopen(note.id)),
                'The Field Note could not be updated. Try again.',
              )
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
