import { type Href, router, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useAppToast } from '@/components/ui/toast';
import { choosePhotos, takePhoto } from '@/contracting/lib/photo-picker';
import { newLocalId } from '@/contracting/readings/capture-attempt';
import { confirm } from '@/lib/confirm';
import { FieldNotePhotoStrip, GALLERY_HINT } from './FieldNotePhotoStrip';
import { useFieldNotes } from './FieldNotesProvider';
import { fieldNoteFiles } from './files';
import { FIELD_NOTE_DESCRIPTION_MAX, type PickedPhoto } from './store';
import { useFieldNoteAction } from './use-field-note-action';

const PICK_FAILED = 'The photo could not be added. Try again.';
const backToNotes = () => router.replace('/contracting/notes' as Href);

/** A draft in component state: nothing reaches storage, the sandbox, or the gallery until Save note. */
export default function NewFieldNoteScreen() {
  const { create } = useFieldNotes();
  const navigation = useNavigation();
  const showToast = useAppToast();
  const { bottom } = useSafeAreaInsets();
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<(PickedPhoto & { id: string })[]>([]);
  const [saved, setSaved] = useState(false);
  const { busy, error, act } = useFieldNoteAction();
  const limit = fieldNoteFiles.photoLimit;
  const hasContent = description.trim() !== '' || photos.length > 0;

  usePreventRemove(hasContent && !saved, ({ data }) => {
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
      const { galleryFailed } = await create({ description, photos });
      if (galleryFailed) showToast('success', `Field Note saved. ${GALLERY_HINT}`);
      setSaved(true);
    }, 'The Field Note could not be saved. Try again.');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="New Field Note"
        subtitle="CONTRACTING"
        parentLabel="Notes"
        onBack={backToNotes}
        helpTopic="contractingMobileFieldNote"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
          <Text className="text-muted-foreground">
            Photograph the meter and write what management needs: the Machine Code, the farm, and the meter value if you
            can read it.
          </Text>
          <FieldNotePhotoStrip
            photos={photos}
            limit={limit}
            busy={busy}
            galleryHint={false}
            onTake={() => void pick(async () => [await takePhoto()].filter((photo) => photo !== null))}
            onChoose={() => void pick(() => choosePhotos(limit - photos.length))}
            onRemove={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
          />
          <Text className="text-foreground" weight="semibold">
            Description
          </Text>
          <TextInput
            accessibilityLabel="Field Note description"
            placeholder="e.g. T12 at Rietfontein, meter 4211.5"
            value={description}
            editable={!busy}
            multiline
            maxLength={FIELD_NOTE_DESCRIPTION_MAX}
            onChangeText={setDescription}
            className="min-h-28"
            textAlignVertical="top"
          />
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
            primary
            title={busy ? 'Saving…' : 'Save note'}
            disabled={busy || !hasContent}
            onPress={() => {
              void save();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
