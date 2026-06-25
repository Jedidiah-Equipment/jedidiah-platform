import { IconArrowsLeftRight } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { type BaySort, isBaySort, sortBayCards } from '@/lib/bay-sort';
import { sortJobCards } from '@/lib/job-sort';
import type { BayListState } from '@/lib/use-bay-list';
import type { JobListState } from '@/lib/use-job-list';
import { usePersistedState } from '@/lib/use-persisted-state';

import { BayCard } from './BayCard';
import { BoardGrid } from './BoardGrid';
import { JobCard } from './JobCard';

export type ListMode = 'bays' | 'jobs';

const SORT_OPTIONS: readonly { label: string; value: BaySort }[] = [
  { label: 'DAYS LEFT', value: 'days-left' },
  { label: 'BAY NAME', value: 'name' },
];

// Jobs tiles carry more signal (status chip + stage label), so they want a touch more width.
const JOB_MIN_CARD_WIDTH = 248;
const SKELETON_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;

/**
 * The shop-floor board: a responsive grid of Bay or Job cards under a tappable title that flips
 * the two views in place. Both modes read the same cached schedule ({@link useBayList} /
 * {@link useJobList}), so toggling is instant with no refetch. The data + pull-to-refresh live in
 * the screen; this stays a pure render of the two list states. Owns the loading skeleton, empty,
 * forbidden, and error states, plus the Bays-only sort control.
 */
export function BoardList({
  listMode,
  onToggleListMode,
  bayState,
  jobState,
}: {
  listMode: ListMode;
  onToggleListMode: () => void;
  bayState: BayListState;
  jobState: JobListState;
}) {
  const router = useRouter();
  const [sort, setSort] = usePersistedState<BaySort>('jedidiah-bay-sort', 'days-left', isBaySort);
  const isBays = listMode === 'bays';
  const state = isBays ? bayState : jobState;
  const noun = isBays ? 'bay' : 'job';

  const count =
    state.status === 'ready' ? `${state.cards.length} ${state.cards.length === 1 ? noun : `${noun}s`}` : null;

  return (
    <View>
      <Header
        count={count}
        onToggle={onToggleListMode}
        title={isBays ? 'Bays' : 'Jobs'}
        trailing={isBays && bayState.status === 'ready' ? <SortControl onChange={setSort} sort={sort} /> : null}
      />

      {state.status === 'forbidden' ? (
        <Panel title="You don’t have access to the shop floor.">
          Your account doesn’t have Job access. Ask an administrator to update your permissions.
        </Panel>
      ) : state.status === 'error' ? (
        <Panel tone="danger" title="Couldn’t load the shop floor.">
          Pull to retry, or check your connection.
        </Panel>
      ) : state.status === 'pending' ? (
        <BoardGrid
          items={SKELETON_KEYS}
          keyOf={(key) => key}
          minCardWidth={isBays ? undefined : JOB_MIN_CARD_WIDTH}
          renderItem={() => <SkeletonCard />}
        />
      ) : isBays && bayState.status === 'ready' ? (
        bayState.cards.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No enabled bays yet.</Text>
        ) : (
          <BoardGrid
            items={sortBayCards(bayState.cards, sort)}
            keyOf={(bay) => bay.id}
            renderItem={(bay) => (
              <BayCard
                bay={bay}
                onPress={() => router.push({ pathname: '/bays/[bayId]', params: { bayId: bay.id } })}
              />
            )}
          />
        )
      ) : !isBays && jobState.status === 'ready' ? (
        jobState.cards.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No active jobs.</Text>
        ) : (
          <BoardGrid
            items={sortJobCards(jobState.cards)}
            keyOf={(job) => job.jobId}
            minCardWidth={JOB_MIN_CARD_WIDTH}
            renderItem={(job) => (
              <JobCard
                job={job}
                onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: job.jobId } })}
              />
            )}
          />
        )
      ) : null}
    </View>
  );
}

/** Tappable title that flips Bays ⇄ Jobs in place, with the live count and the Bays-only sort control. */
function Header({
  count,
  onToggle,
  title,
  trailing,
}: {
  count: string | null;
  onToggle: () => void;
  title: string;
  trailing: ReactNode;
}) {
  return (
    <View className="mb-3.5 flex-row items-center justify-between gap-3">
      <Pressable
        accessibilityHint="Switches between the Bays and Jobs views"
        accessibilityRole="button"
        className="flex-row items-center gap-2.5 active:opacity-70"
        onPress={onToggle}
      >
        <Text className="text-2xl text-foreground" weight="bold">
          {title}
        </Text>
        <View className="h-6 w-6 items-center justify-center rounded-lg border border-border bg-surface">
          <Icon className="text-muted-foreground" icon={IconArrowsLeftRight} size={13} />
        </View>
        {count ? (
          <Text className="text-[11px] tracking-wide text-muted-foreground" mono>
            {count}
          </Text>
        ) : null}
      </Pressable>
      {trailing}
    </View>
  );
}

/** SORT segmented control (Bays only): orders the grid by days-left (default) or Bay name. */
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

function Panel({
  children,
  title,
  tone = 'default',
}: {
  children: string;
  title: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <View>
      <Text className={`text-sm ${tone === 'danger' ? 'text-danger' : 'text-foreground'}`} weight="semibold">
        {title}
      </Text>
      <Text className="mt-1 text-sm text-muted-foreground">{children}</Text>
    </View>
  );
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
