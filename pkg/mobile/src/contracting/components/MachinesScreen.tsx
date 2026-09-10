import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MainToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useIsOffline } from '@/lib/connectivity';
import { CategoryIcon } from './CategoryIcon';
import { ReadingButton } from './ReadingButton';

export default function MachinesScreen() {
  const fleet = useFleet();
  const { items, error } = useReadingQueue();
  const offline = useIsOffline();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const categories = [
    ...new Map(
      fleet.data?.map((machine) => [
        machine.categoryId,
        {
          id: machine.categoryId,
          name: machine.categoryName,
          icon: machine.categoryIcon,
          colour: machine.categoryColour,
        },
      ]),
    ).values(),
  ];
  const machines = fleet.data?.filter(
    (machine) =>
      machine.code.toLowerCase().includes(search.trim().toLowerCase()) &&
      (!category || machine.categoryId === category),
  );
  const attention = items.filter((item) => item.attention).length;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainToolbar title="Machines" subtitle="CONTRACTING" helpTopic="contractingMobileMachines" />
      <View className="gap-3 px-4 py-3">
        {offline ? (
          <Text className="text-sm text-muted-foreground">
            Offline · showing saved Machines. Captures stay on this phone until synced.
          </Text>
        ) : null}
        <ReadingButton
          title={`Needs attention (${attention}) · ${items.length - attention} queued`}
          onPress={() => router.push('/contracting/attention')}
        />
        {error ? <Text className="text-danger">{error}</Text> : null}
        <TextInput
          accessibilityLabel="Search Machine code"
          placeholder="Search Machine code"
          value={search}
          onChangeText={setSearch}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {[{ id: null, name: 'All categories' }, ...categories].map((item) => (
              <Pressable
                key={item.id ?? 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected: category === item.id }}
                onPress={() => setCategory(item.id)}
                className={`flex-row items-center gap-2 rounded-full border border-border py-1.5 pr-3 pl-1.5 ${category === item.id ? 'bg-primary' : 'bg-surface'}`}
              >
                {'icon' in item ? <CategoryIcon icon={item.icon} colour={item.colour} size={16} /> : null}
                <Text className={category === item.id ? 'text-primary-foreground' : 'text-foreground'}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>
      <FlatList
        data={machines ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        refreshing={!offline && fleet.isRefetching}
        onRefresh={() => {
          void fleet.refetch();
        }}
        ListEmptyComponent={
          <Text className="text-muted-foreground">
            {!fleet.canRead
              ? 'Your role cannot view field Machines.'
              : fleet.data
                ? 'No Machines match your search.'
                : offline
                  ? 'Connect once to save the fleet on this phone.'
                  : fleet.isError
                    ? 'Unable to load Machines. Pull to retry.'
                    : 'Loading Machines…'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/contracting/machines/${item.id}`)}
            className="w-full gap-2 rounded-xl border border-border bg-surface p-4"
          >
            <View className="flex-row items-center justify-between gap-2">
              <View className="flex-row items-center gap-3">
                <CategoryIcon icon={item.categoryIcon} colour={item.categoryColour} size={20} />
                <Text className="text-lg text-foreground" weight="bold">
                  {item.code}
                </Text>
              </View>
              <Text className="rounded-full bg-muted px-3 py-1 text-xs text-foreground">In Yard</Text>
            </View>
            <Text className="text-sm text-muted-foreground">
              {item.make} {item.model} · {item.categoryName}
            </Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
