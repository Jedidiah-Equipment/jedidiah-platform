import { formatDate, formatHours } from '@pkg/domain';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useSessionPermission } from '@/lib/auth-session';
import { addBreadcrumb, captureEvent } from '@/lib/observability';
import { useBusyAction } from '@/lib/use-busy-action';
import { attentionParent } from './attention-parent';

export default function AttentionScreen() {
  const parent = attentionParent(useLocalSearchParams<{ from?: string; jobId?: string }>());
  const { queue, items, sync, error } = useReadingQueue();
  const fleet = useFleet();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const { busy, error: actionError, run } = useBusyAction();
  function act(action: () => Promise<void>, resolution: 'discard' | 'resubmit') {
    return run(async () => {
      await action();
      addBreadcrumb('contracting', resolution);
      captureEvent('reading attention resolved', { resolution });
      setConfirmDiscard(null);
      sync();
    }, 'Unable to update the saved capture.');
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Needs attention"
        subtitle="CONTRACTING"
        parentLabel={parent.label}
        onBack={() => router.replace(parent.href as Href)}
        helpTopic="contractingMobileAttention"
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-muted-foreground">
          Captures that cannot sync stay here with the reason. Later captures for the same Machine wait until you
          resolve the earlier one.
        </Text>
        {error || actionError ? <Text className="text-danger">{actionError ?? error}</Text> : null}
        {items
          .filter((item) => item.attention)
          .map((item) => (
            <View key={item.localId} className="gap-3 rounded-xl border border-border bg-surface p-4">
              <Text className="text-lg text-foreground" weight="bold">
                {fleet.data?.find((machine) => machine.id === item.machineId)?.code ?? 'Machine details unavailable'} ·{' '}
                {formatHours(item.value)}
              </Text>
              <Text className="text-sm text-muted-foreground">{formatDate(item.capturedAt, 'medium')}</Text>
              <Text className="text-foreground">{item.attention?.message}</Text>
              {item.assignmentId || item.startAssignment ? (
                <Text className="text-sm text-muted-foreground">
                  Fix the Job on another phone or with management, then discard this capture and start again.
                </Text>
              ) : null}
              {['reading.below_latest', 'reading.previous_changed'].includes(item.attention?.code ?? '') &&
              canCapture ? (
                <DisputeAction
                  machineId={item.machineId}
                  busy={busy}
                  onResubmit={(expectedPreviousId) => {
                    void act(() => queue.resubmit(item.localId, expectedPreviousId), 'resubmit');
                  }}
                />
              ) : null}
              {confirmDiscard === item.localId ? (
                <View className="gap-2">
                  <Text className="text-danger">
                    Discard this capture, any dependent queued departure, and their local photos permanently?
                  </Text>
                  <Button
                    title="Confirm discard"
                    disabled={busy}
                    onPress={() => {
                      void act(() => queue.discard(item.localId), 'discard');
                    }}
                  />
                  <Button title="Keep capture" disabled={busy} onPress={() => setConfirmDiscard(null)} />
                </View>
              ) : (
                <Button title="Discard capture" disabled={busy} onPress={() => setConfirmDiscard(item.localId)} />
              )}
            </View>
          ))}
        {!items.some((item) => item.attention) ? (
          <Text className="text-foreground">No captures need attention.</Text>
        ) : null}
        <Text className="text-muted-foreground">
          {items.filter((item) => !item.attention).length} captures queued. Keep the app open with a connection to sync.
        </Text>
        <Button title="Try sync now" onPress={sync} />
      </ScrollView>
    </SafeAreaView>
  );
}

function DisputeAction({
  machineId,
  busy,
  onResubmit,
}: {
  machineId: string;
  busy: boolean;
  onResubmit: (id: string) => void;
}) {
  const history = useMachineReadings(machineId);
  const latest = history.data?.[0];
  return (
    <View className="gap-3">
      <Text className="text-foreground">
        {latest
          ? `Review the last known reading: ${formatHours(latest.value)} (${formatDate(latest.capturedAt, 'medium')}).`
          : 'Connect to load the latest reading before disputing it.'}
      </Text>
      <Button
        primary
        title="The previous reading is wrong · resubmit as dispute"
        disabled={busy || !latest || history.isFetching}
        onPress={() => {
          if (latest) onResubmit(latest.id);
        }}
      />
    </View>
  );
}
