import { formatDate, formatNumber } from '@pkg/domain';
import { IconPlus } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useFieldNotes } from './FieldNotesProvider';
import type { FieldNote } from './store';

const newestFirst = (a: FieldNote, b: FieldNote) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

export default function FieldNotesScreen() {
  const { notes } = useFieldNotes();
  const open = (notes ?? []).filter((note) => note.status === 'open').sort(newestFirst);
  const closed = (notes ?? []).filter((note) => note.status === 'closed').sort(newestFirst);
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Notes" subtitle="CONTRACTING" helpTopic="contractingMobileFieldNotes" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
        <Button
          primary
          title="New Field Note"
          icon={IconPlus}
          onPress={() => router.push('/contracting/notes/new' as Href)}
        />
        {notes === null ? (
          <Text className="text-muted-foreground">Loading Field Notes…</Text>
        ) : notes.length === 0 ? (
          <Text className="text-muted-foreground">
            No Field Notes. Keep one when you cannot capture a reading, and enter it when you are back online.
          </Text>
        ) : null}
        {open.map((note) => (
          <FieldNoteRow key={note.id} note={note} />
        ))}
        {closed.length ? (
          <View className="gap-2.5 pt-4">
            <Text className="text-muted-foreground" weight="bold">
              Closed
            </Text>
            {closed.map((note) => (
              <FieldNoteRow key={note.id} note={note} />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldNoteRow({ note }: { note: FieldNote }) {
  const firstLine = note.description.split('\n')[0]?.trim();
  const photoCount = note.photos.length;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/contracting/notes/${note.id}` as Href)}
      className="w-full gap-1 rounded-xl border border-border bg-surface p-4"
    >
      <Text className="text-sm text-muted-foreground">{formatDate(note.createdAt, 'medium')}</Text>
      <Text className="text-foreground" weight="semibold" numberOfLines={1}>
        {firstLine || 'Photo note'}
      </Text>
      <Text className="text-sm text-muted-foreground">
        {formatNumber(photoCount)} {photoCount === 1 ? 'photo' : 'photos'}
      </Text>
    </Pressable>
  );
}
