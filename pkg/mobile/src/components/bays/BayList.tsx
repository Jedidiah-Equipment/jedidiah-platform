import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, View } from 'react-native';

import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { useBayList } from '@/lib/use-bay-list';

import { BayCard } from './BayCard';

// Mirrors the mockup grid `repeat(auto-fill, minmax(232px, 1fr))` with a 14px gap.
const MIN_CARD_WIDTH = 232;
const GAP = 14;
const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/** Columns that fit a measured width at the minimum card width — 1 on phones, more on tablets. */
function columnsForWidth(width: number): number {
  if (width <= 0) return 1;

  return Math.max(1, Math.floor((width + GAP) / (MIN_CARD_WIDTH + GAP)));
}

/**
 * The 'Bays' section: a count and a responsive grid of {@link BayCard}s that
 * reflows phone → tablet by measuring its own width. Owns the loading skeleton,
 * empty, and error states.
 */
export function BayList() {
  const router = useRouter();
  const state = useBayList();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (state.status === 'error') {
    return (
      <Section count={null}>
        <Text className="text-sm text-danger" weight="semibold">
          Couldn’t load bays.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">Pull to retry, or check your connection.</Text>
      </Section>
    );
  }

  if (state.status === 'pending') {
    return (
      <Section count={null}>
        <Grid width={width} onLayout={onLayout}>
          {SKELETON_KEYS.map((key) => (
            <Cell key={key} width={width}>
              <SkeletonCard />
            </Cell>
          ))}
        </Grid>
      </Section>
    );
  }

  if (state.cards.length === 0) {
    return (
      <Section count="0 bays">
        <Text className="text-sm text-muted-foreground">No enabled bays yet.</Text>
      </Section>
    );
  }

  return (
    <Section count={`${state.cards.length} ${state.cards.length === 1 ? 'bay' : 'bays'}`}>
      <Grid width={width} onLayout={onLayout}>
        {state.cards.map((bay) => (
          <Cell key={bay.id} width={width}>
            <BayCard bay={bay} onPress={() => router.push({ pathname: '/bays/[bayId]', params: { bayId: bay.id } })} />
          </Cell>
        ))}
      </Grid>
    </Section>
  );
}

function Section({ count, children }: { count: string | null; children: ReactNode }) {
  return (
    <View>
      <View className="mb-3.5 flex-row items-baseline justify-between">
        <Text className="text-2xl text-foreground" weight="bold">
          Bays
        </Text>
        {count ? <Text className="text-xs text-muted-foreground tracking-wide">{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function Grid({
  width,
  onLayout,
  children,
}: {
  width: number;
  onLayout: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  return (
    <View className="flex-row flex-wrap" onLayout={onLayout} style={{ gap: GAP }}>
      {width > 0 ? children : null}
    </View>
  );
}

/** Wraps a child to the computed column width so the row fills the grid evenly. */
function Cell({ width, children }: { width: number; children: ReactNode }) {
  const columns = columnsForWidth(width);
  const cellWidth = (width - GAP * (columns - 1)) / columns;

  return <View style={{ width: cellWidth }}>{children}</View>;
}

function SkeletonCard() {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <View className="flex-row items-center gap-2.5">
        <Pulse className="h-9 w-9 rounded-lg" />
        <View className="flex-1 gap-1.5">
          <Pulse className="h-3.5 w-2/3 rounded" />
          <Pulse className="h-2.5 w-1/2 rounded" />
        </View>
      </View>
      <View className="mt-4 gap-2">
        <Pulse className="h-8 w-20 rounded" />
        <Pulse className="h-1.5 w-full rounded-full" />
      </View>
    </View>
  );
}
