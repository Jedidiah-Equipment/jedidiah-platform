import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useCapturePermission } from '@/contracting/readings/use-capture-permission';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useIsOffline } from '@/lib/connectivity';
import { ReadingButton } from './ReadingButton';

export default function MachineScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === id);
  const readings = useMachineReadings(id);
  const { items } = useReadingQueue();
  const pending = items
    .filter((row) => row.machineId === id)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt));
  const offline = useIsOffline();
  const canCapture = useCapturePermission();
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
          <Text className="text-lg text-foreground" weight="bold">
            {machine ? `${machine.make} ${machine.model}` : 'Machine details unavailable'}
          </Text>
          <Text className="text-muted-foreground">{machine?.categoryName} · In Yard</Text>
          <Text className="text-3xl text-foreground" weight="bold">
            {readings.data?.[0] ? `${readings.data[0].value.toFixed(1)} h` : 'No known reading'}
          </Text>
          <Text className="text-sm text-muted-foreground">Latest synced hours</Text>
          {pending[0] ? (
            <Text className="text-foreground">
              Latest local capture: {pending[0].value.toFixed(1)} h ·{' '}
              {pending[0].attention ? 'Needs attention' : 'Queued'}
            </Text>
          ) : null}
        </View>
        {canCapture && machine ? (
          <ReadingButton
            primary
            title="Capture reading"
            onPress={() => router.push(`/contracting/machines/${id}/capture`)}
          />
        ) : null}
        <Text className="text-lg text-foreground" weight="bold">
          Reading history
        </Text>
        {pending.map((row) => (
          <View key={row.localId} className="gap-1 rounded-xl border border-border p-4">
            <Text className="text-foreground" weight="semibold">
              {row.value.toFixed(1)} h · {row.attention ? 'Needs attention' : 'Queued'}
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
