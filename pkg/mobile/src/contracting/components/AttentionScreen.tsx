import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useCapturePermission } from '@/contracting/readings/use-capture-permission';
import { useFleet } from '@/contracting/readings/use-fleet';
import { ReadingButton } from './ReadingButton';

export default function AttentionScreen() {
  const { queue, items, sync, error } = useReadingQueue();
  const fleet = useFleet();
  const canCapture = useCapturePermission();
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setConfirmDiscard(null);
      sync();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update the saved capture.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Needs attention"
        subtitle="CONTRACTING"
        parentLabel="Machines"
        onBack={() => router.replace('/contracting')}
        helpTopic="contractingMobileAttention"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-muted-foreground">
          Captures refused by the server stay here. Later captures for the same Machine wait until you resolve the
          earlier one.
        </Text>
        {error || actionError ? <Text className="text-danger">{actionError ?? error}</Text> : null}
        {items
          .filter((item) => item.attention)
          .map((item) => (
            <View key={item.localId} className="gap-3 rounded-xl border border-border bg-surface p-4">
              <Text className="text-lg text-foreground" weight="bold">
                {fleet.data?.find((machine) => machine.id === item.machineId)?.code ?? item.machineId} ·{' '}
                {item.value.toFixed(1)} h
              </Text>
              <Text className="text-sm text-muted-foreground">{new Date(item.capturedAt).toLocaleString()}</Text>
              <Text className="text-foreground">{item.attention?.message}</Text>
              {item.attention?.code === 'reading.below_latest' && canCapture ? (
                <ReadingButton
                  primary
                  title="The previous reading is wrong · resubmit as dispute"
                  disabled={busy}
                  onPress={() => {
                    void act(() => queue.resubmit(item.localId));
                  }}
                />
              ) : null}
              {confirmDiscard === item.localId ? (
                <View className="gap-2">
                  <Text className="text-danger">Discard this capture and its local photo permanently?</Text>
                  <ReadingButton
                    title="Confirm discard"
                    disabled={busy}
                    onPress={() => {
                      void act(() => queue.discard(item.localId));
                    }}
                  />
                  <ReadingButton title="Keep capture" disabled={busy} onPress={() => setConfirmDiscard(null)} />
                </View>
              ) : (
                <ReadingButton
                  title="Discard capture"
                  disabled={busy}
                  onPress={() => setConfirmDiscard(item.localId)}
                />
              )}
            </View>
          ))}
        {!items.some((item) => item.attention) ? (
          <Text className="text-foreground">No captures need attention.</Text>
        ) : null}
        <Text className="text-muted-foreground">
          {items.filter((item) => !item.attention).length} captures queued. Keep the app open with a connection to sync.
        </Text>
        <ReadingButton title="Try sync now" onPress={sync} />
      </ScrollView>
    </SafeAreaView>
  );
}
