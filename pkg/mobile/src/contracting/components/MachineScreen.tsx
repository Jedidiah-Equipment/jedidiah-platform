import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { latestKnownReading } from '@/contracting/readings/latest-reading';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { useIsOffline } from '@/lib/connectivity';
import { CategoryIcon } from './CategoryIcon';
import { queuedReadingStatus } from './reading-status';

export default function MachineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === id);
  const readings = useMachineReadings(id);
  const { items } = useReadingQueue();
  const pending = items
    .filter((row) => row.machineId === id)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  const latest = latestKnownReading(id, items, readings.data);
  const latestLocal = pending.find((row) => row.localId === latest?.id);
  const readingStatus = queuedReadingStatus(latestLocal);
  const offline = useIsOffline();
  const canCapture = useSessionPermission('contracting_reading:capture');
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title={machine?.code ?? 'Machine'}
        subtitle="CONTRACTING"
        parentLabel="Machines"
        onBack={() => router.replace('/contracting')}
        helpTopic="contractingMobileMachine"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        {offline ? <Text className="text-muted-foreground">Offline · latest saved history</Text> : null}
        <View className="gap-2 rounded-xl border border-border bg-surface p-4">
          <View className="flex-row items-center gap-3">
            {machine ? <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={24} /> : null}
            <Text className="text-lg text-foreground" weight="bold">
              {machine ? `${machine.make} ${machine.model}` : 'Machine details unavailable'}
            </Text>
          </View>
          {machine ? <Text className="text-muted-foreground">{machine.categoryName}</Text> : null}
          <Text className="text-3xl text-foreground" weight="bold">
            {latest ? `${latest.value.toFixed(1)} h` : 'No known reading'}
          </Text>
          {latest ? (
            <View className="flex-row items-center gap-1">
              <Icon icon={readingStatus.icon} className={readingStatus.className} size={14} />
              <Text className={`text-sm ${readingStatus.className}`}>{readingStatus.label}</Text>
            </View>
          ) : null}
          {pending[0] && !latestLocal ? (
            <Text className="text-foreground">
              Latest local capture: {pending[0].value.toFixed(1)} h · {queuedReadingStatus(pending[0]).label}
            </Text>
          ) : null}
        </View>
        {canCapture && machine ? (
          <Button primary title="Capture reading" onPress={() => router.push(`/contracting/machines/${id}/capture`)} />
        ) : null}
        <Text className="text-lg text-foreground" weight="bold">
          Reading history
        </Text>
        {pending.map((row) => (
          <View key={row.localId} className="gap-1 rounded-xl border border-border p-4">
            <Text className="text-foreground" weight="semibold">
              {row.value.toFixed(1)} h · {queuedReadingStatus(row).label}
            </Text>
            <Text className="text-sm text-muted-foreground">{new Date(row.capturedAt).toLocaleString()}</Text>
          </View>
        ))}
        {readings.data?.map((row) => (
          <View key={row.id} className="gap-1 rounded-xl border border-border bg-surface p-4">
            <Text className="text-foreground" weight="semibold">
              {row.value.toFixed(1)} h ·{' '}
              {{ baseline: 'Baseline', spot: 'Spot', arrival: 'Arrival', departure: 'Departure' }[row.role]}
            </Text>
            <Text className="text-sm text-muted-foreground">{new Date(row.capturedAt).toLocaleString()}</Text>
            <Text className="text-sm text-muted-foreground">
              {row.photoBacked ? 'Photo-backed' : 'Missing Photo Evidence'}
              {row.disputed ? ' · Disputed' : ''}
            </Text>
          </View>
        ))}
        {!readings.data?.length ? (
          <Text className="text-muted-foreground">
            {readings.isError ? 'History could not be refreshed.' : 'No saved reading history.'}
          </Text>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
