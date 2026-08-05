import { parseScanToken } from '@pkg/domain';
import type { QuickSwitchActor } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useTRPC } from '@/lib/trpc';
import { loadingSpinnerColor } from '@/theme/brand-colors';

import { ScanField } from './ScanField';

/**
 * Both halves of the quick-switch (spec §11): tap a name, or scan a badge card.
 *
 * The badge field lives *here* rather than only on the scan home, because this dialog is reachable
 * from every stores screen — a storeman who reaches the checkout screen and finds the wrong name on
 * it has to be able to correct it with the card in his hand, not walk back to the home screen.
 *
 * Tiles are deliberately large: this is tapped with a work glove on, often without looking away
 * from what is in the other hand.
 */
export function QuickSwitchModal({
  onClose,
  onSelect,
  open,
}: {
  onClose: () => void;
  onSelect: (actor: QuickSwitchActor) => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const actors = useQuery(trpc.inventory.quickSwitchActors.queryOptions(undefined, { enabled: open }));
  const [badgeError, setBadgeError] = useState<string | null>(null);

  function selectByBadge(raw: string) {
    const token = parseScanToken(raw);
    if (token.kind === 'empty') return;
    // Anything that is not a badge is a Part label, and picking a person is not the moment to go
    // looking one up — say so rather than closing the dialog on an unrelated scan.
    if (token.kind !== 'badge') {
      setBadgeError('That is a Part label, not a badge card.');
      return;
    }

    const actor = actors.data?.items.find((candidate) => candidate.id === token.userId);
    if (!actor) {
      setBadgeError('That badge is not recognised. Tap your name instead.');
      return;
    }

    setBadgeError(null);
    onSelect(actor);
    onClose();
  }

  return (
    <ThemedModal backdropLabel="Close the name list" onClose={onClose} open={open}>
      <View className="max-h-[80%] w-full max-w-[560px] rounded-2xl border border-border bg-surface p-5">
        <Text className="text-xl text-surface-foreground" weight="bold">
          Who is at the tablet?
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">Scan your badge card, or tap your name.</Text>

        <View className="mt-4">
          <ScanField onScan={selectByBadge} placeholder="Scan your badge card" />
          {badgeError === null ? null : (
            <Text className="mt-2 text-sm text-danger" weight="semibold">
              {badgeError}
            </Text>
          )}
        </View>

        {actors.isPending ? (
          <View className="items-center py-10">
            <ActivityIndicator accessibilityLabel="Loading names" color={loadingSpinnerColor} size="large" />
          </View>
        ) : actors.isError ? (
          <Text className="py-10 text-center text-sm text-danger">Couldn’t load the names. Pull down to retry.</Text>
        ) : actors.data.items.length === 0 ? (
          <Text className="py-10 text-center text-sm text-muted-foreground">
            Nobody holds the Stores role yet. Ask the office to set one.
          </Text>
        ) : (
          <ScrollView className="mt-4" contentContainerClassName="flex-row flex-wrap gap-3">
            {actors.data.items.map((actor) => (
              <Pressable
                accessibilityLabel={`Work as ${actor.name}`}
                accessibilityRole="button"
                className="min-w-[46%] grow flex-row items-center gap-3 rounded-xl border border-border bg-elevated px-4 py-4"
                key={actor.id}
                onPress={() => {
                  onSelect(actor);
                  onClose();
                }}
              >
                <Avatar
                  className="h-12 w-12 rounded-full"
                  name={actor.name}
                  textClassName="text-sm"
                  uri={actor.thumbnailDataUrl}
                />
                <Text className="min-w-0 flex-1 text-base text-surface-foreground" numberOfLines={2} weight="semibold">
                  {actor.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Pressable
          accessibilityRole="button"
          className="mt-5 items-center rounded-xl border border-border px-4 py-3"
          onPress={onClose}
        >
          <Text className="text-sm text-surface-foreground" weight="semibold">
            Cancel
          </Text>
        </Pressable>
      </View>
    </ThemedModal>
  );
}
