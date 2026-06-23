import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, Pressable, View } from 'react-native';

import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { type BaySort, isBaySort, sortBayCards } from '@/lib/bay-sort';
import type { BayListState } from '@/lib/use-bay-list';
import { usePersistedState } from '@/lib/use-persisted-state';

import { BayCard } from './BayCard';

const SORT_OPTIONS: readonly { label: string; value: BaySort }[] = [
  { label: 'DAYS LEFT', value: 'days-left' },
  { label: 'BAY NAME', value: 'name' },
];

// Mirrors the mockup grid `repeat(auto-fill, minmax(232px, 1fr))` with a 14px gap.
const MIN_CARD_WIDTH = 232;
// The page fills its container, but a single card never stretches past this — it keeps
// the tile readable when only one column fits a wide-ish viewport.
const MAX_CARD_WIDTH = 420;
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
 * empty, forbidden, and error states. The data + pull-to-refresh live in the
 * screen ({@link useBayList}); this stays a pure render of {@link BayListState}.
 */
export function BayList({ state }: { state: BayListState }) {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const [sort, setSort] = usePersistedState<BaySort>('jedidiah-bay-sort', 'days-left', isBaySort);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  if (state.status === 'forbidden') {
    return (
      <Section>
        <Text className="text-sm text-foreground" weight="semibold">
          You don’t have access to the shop floor.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">
          Your account doesn’t have Job access. Ask an administrator to update your permissions.
        </Text>
      </Section>
    );
  }

  if (state.status === 'error') {
    return (
      <Section>
        <Text className="text-sm text-danger" weight="semibold">
          Couldn’t load bays.
        </Text>
        <Text className="mt-1 text-sm text-muted-foreground">Pull to retry, or check your connection.</Text>
      </Section>
    );
  }

  if (state.status === 'pending') {
    return (
      <Section>
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
      <Section>
        <Text className="text-sm text-muted-foreground">No enabled bays yet.</Text>
      </Section>
    );
  }

  const cards = sortBayCards(state.cards, sort);

  return (
    <Section trailing={<SortControl sort={sort} onChange={setSort} />}>
      <Grid width={width} onLayout={onLayout}>
        {cards.map((bay) => (
          <Cell key={bay.id} width={width}>
            <BayCard bay={bay} onPress={() => router.push({ pathname: '/bays/[bayId]', params: { bayId: bay.id } })} />
          </Cell>
        ))}
      </Grid>
    </Section>
  );
}

/** SORT segmented control: orders the grid by days-left (default) or Bay name. */
function SortControl({ sort, onChange }: { sort: BaySort; onChange: (sort: BaySort) => void }) {
  return (
    <View className="flex-row items-center gap-3">
      <Text className="text-[11px] tracking-widest text-muted-foreground" mono weight="semibold">
        SORT
      </Text>
      <View className="flex-row rounded-xl border border-border bg-surface p-1">
        {SORT_OPTIONS.map((option) => {
          const selected = option.value === sort;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              className={`rounded-lg border px-3 py-1.5 ${selected ? 'border-border bg-elevated' : 'border-transparent'}`}
              onPress={() => onChange(option.value)}
            >
              <Text
                className={`text-[11px] tracking-wider ${selected ? 'text-foreground' : 'text-muted-foreground'}`}
                mono
                weight="semibold"
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Section({ trailing, children }: { trailing?: ReactNode; children: ReactNode }) {
  return (
    <View>
      <View className="mb-3.5 flex-row items-center justify-between gap-3">
        <Text className="text-2xl text-foreground" weight="bold">
          Bays
        </Text>
        {trailing}
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
  const cellWidth = Math.min((width - GAP * (columns - 1)) / columns, MAX_CARD_WIDTH);

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
