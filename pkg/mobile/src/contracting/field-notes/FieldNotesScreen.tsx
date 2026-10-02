import { formatDate, formatNumber } from '@pkg/domain';
import { IconFilter } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type ListControlOption,
  ListControlRow,
  ListCreateControl,
  ListDropdownControl,
  ListSearchControl,
} from '@/components/ListControls';
import { MainToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { useFieldNotes } from './FieldNotesProvider';
import { type FieldNoteStatusFilter, visibleFieldNotes } from './note-list';
import type { FieldNote } from './store';

const STATUS_OPTIONS: readonly ListControlOption<FieldNoteStatusFilter>[] = [
  { label: 'Open notes', value: 'open' },
  { label: 'Closed notes', value: 'closed' },
];

export default function FieldNotesScreen() {
  const { notes } = useFieldNotes();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<FieldNoteStatusFilter>('open');
  const visible = visibleFieldNotes(notes ?? [], { status, search });
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Notes" subtitle="CONTRACTING" helpTopic="contractingMobileFieldNotes" />
      <View className="gap-3 px-4 py-3">
        <ListControlRow
          leading={
            <ListSearchControl
              accessibilityLabel="Search Field Notes"
              onChangeText={setSearch}
              placeholder="Search by description…"
              value={search}
            />
          }
          trailing={
            <View className="flex-row items-center gap-2">
              <ListDropdownControl
                accessibilityLabel="Filter Field Notes by status"
                defaultValue="open"
                dismissLabel="Dismiss Field Note status filter"
                icon={IconFilter}
                onChange={setStatus}
                options={STATUS_OPTIONS}
                value={status}
              />
              <ListCreateControl label="New Field Note" onPress={() => router.push('/contracting/notes/new' as Href)} />
            </View>
          }
        />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(note) => note.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 10 }}
        ListEmptyComponent={
          <Text className="text-muted-foreground">
            {notes === null
              ? 'Loading Field Notes…'
              : search.trim()
                ? 'No Field Notes match your search.'
                : status === 'open'
                  ? 'No Open Field Notes. Keep one when you cannot capture a reading, and enter it when you are back online.'
                  : 'No Closed Field Notes.'}
          </Text>
        }
        renderItem={({ item }) => <FieldNoteRow note={item} />}
      />
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
