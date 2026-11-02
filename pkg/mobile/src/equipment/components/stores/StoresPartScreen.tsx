import type { StockOnHandRow } from '@pkg/schema/equipment';
import type { Href } from 'expo-router';
import type React from 'react';
import { View } from 'react-native';

import { ActivityIndicator } from '@/components/ui/activity-indicator';
import { Text } from '@/components/ui/text';
import { usePartByCode } from '@/equipment/lib/use-stores-post';

import { StoresScreen } from './StoresScreen';

/**
 * The shell every screen that acts on a scanned Part wears: load it, or say why it could not be.
 *
 * Four posting screens plus the Part screen itself all begin the same way, and the loading and
 * failure wording is part of the tablet's voice rather than each screen's own business — so they
 * share it here and receive the resolved row.
 */
export function StoresPartScreen({
  children,
  onNearScrollEnd,
  fallback,
  partCode,
  title,
}: {
  children: (row: StockOnHandRow) => React.ReactNode;
  onNearScrollEnd?: () => void;
  /** Where back goes with nothing beneath; the Part by default. */
  fallback?: Href;
  partCode: string;
  title: string;
}) {
  const part = usePartByCode(partCode);
  const back = fallback ?? ({ pathname: '/equipment/stores/parts/[partCode]', params: { partCode } } as const);

  if (part.isPending) {
    return (
      <StoresScreen fallback={back} subtitle={partCode} title={title}>
        <View className="items-center py-10">
          <ActivityIndicator accessibilityLabel="Loading Part" size="large" />
        </View>
      </StoresScreen>
    );
  }

  if (part.isError) {
    return (
      <StoresScreen fallback={back} subtitle={partCode} title={title}>
        <Text className="py-10 text-center text-sm text-danger">
          Couldn’t load this Part. Pull down to retry, or scan it again.
        </Text>
      </StoresScreen>
    );
  }

  return (
    <StoresScreen
      fallback={back}
      onNearScrollEnd={onNearScrollEnd}
      subtitle={`${part.data.partCode} · ${part.data.partName}`}
      title={title}
    >
      {children(part.data)}
    </StoresScreen>
  );
}

/**
 * The one thing that stops a movement before its own fields do. Shared so the sentence reads
 * identically everywhere a post is about to happen — this is the tablet's central rule, and a
 * screen that phrased it differently would read as a different rule.
 */
export function NoActorNotice({ actorUserId }: { actorUserId: string | null }) {
  if (actorUserId !== null) return null;

  return (
    <Text className="text-sm text-danger" weight="semibold">
      Choose who is at the tablet before posting.
    </Text>
  );
}
