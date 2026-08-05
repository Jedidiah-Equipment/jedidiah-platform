import type { QuickSwitchActor } from '@pkg/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { resolveBadgeScan } from '@/lib/stores-scan-resolution';
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
 * from what is in the other hand. They sit in two fixed half-width columns, with the gutter as
 * padding inside each cell and a matching negative margin on the row — a `gap` plus `grow` made an
 * odd last name stretch across the full width, and a tile twice its neighbours' size reads as more
 * important than them rather than merely last.
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
  const queryClient = useQueryClient();
  const actors = useQuery(trpc.inventory.quickSwitchActors.queryOptions(undefined, { enabled: open }));
  const [badgeError, setBadgeError] = useState<string | null>(null);

  async function selectByBadge(raw: string) {
    const resolution = await resolveBadgeScan({
      fetchActors: () => queryClient.fetchQuery(trpc.inventory.quickSwitchActors.queryOptions()),
      raw,
    });

    switch (resolution.kind) {
      case 'actor':
        setBadgeError(null);
        onSelect(resolution.actor);
        onClose();
        break;
      case 'error':
        setBadgeError(resolution.message);
        break;
      // A badge-only field never resolves a Part, so `part` cannot arrive here.
      case 'part':
      case 'ignored':
        break;
    }
  }

  return (
    <ThemedModal backdropLabel="Close the name list" onClose={onClose} open={open}>
      <View className="max-h-[80%] w-full max-w-[560px] rounded-2xl border border-border bg-surface p-5">
        <Text className="text-xl text-surface-foreground" weight="bold">
          Who is at the tablet?
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">Scan your badge card, or tap your name.</Text>

        <View className="mt-4">
          <ScanField
            caption="SCAN A BADGE CARD, OR TAP A NAME BELOW"
            onScan={(raw) => void selectByBadge(raw)}
            placeholder="Scan your badge card"
          />
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
          <ScrollView className="mt-4" contentContainerClassName="-mx-1.5 flex-row flex-wrap">
            {actors.data.items.map((actor) => (
              <View className="w-1/2 p-1.5" key={actor.id}>
                <Pressable
                  accessibilityLabel={`Work as ${actor.name}`}
                  accessibilityRole="button"
                  className="flex-row items-center gap-3 rounded-xl border border-border bg-elevated px-4 py-4"
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
                  <Text
                    className="min-w-0 flex-1 text-base text-surface-foreground"
                    numberOfLines={2}
                    weight="semibold"
                  >
                    {actor.name}
                  </Text>
                </Pressable>
              </View>
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
