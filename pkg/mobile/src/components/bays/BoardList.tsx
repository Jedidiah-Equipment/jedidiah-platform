import { IconArrowsLeftRight } from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ListControlRow, SegmentedSortControl } from '@/components/ListControls';
import { Icon } from '@/components/ui/icon';
import { Pulse } from '@/components/ui/pulse';
import { Text } from '@/components/ui/text';
import { type BaySort, isBaySort, sortBayCards } from '@/lib/bay-sort';
import { isJobSort, type JobSort, sortJobCards } from '@/lib/job-sort';
import type { BayListState } from '@/lib/use-bay-list';
import type { JobListState } from '@/lib/use-job-list';
import { usePersistedState } from '@/lib/use-persisted-state';

import { BayCard } from './BayCard';
import { BoardGrid } from './BoardGrid';
import { JobCard } from './JobCard';

export type ListMode = 'bays' | 'jobs';

export function isListMode(value: unknown): value is ListMode {
  return value === 'bays' || value === 'jobs';
}

const BAY_SORT_OPTIONS: readonly { label: string; value: BaySort }[] = [
  { label: 'Days left', value: 'days-left' },
  { label: 'Bay name', value: 'name' },
];
const JOB_SORT_OPTIONS: readonly { label: string; value: JobSort }[] = [
  { label: 'Days left', value: 'days-left' },
  { label: 'Newest', value: 'newest' },
];

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
  const [baySort, setBaySort] = usePersistedState<BaySort>('jedidiah-bay-sort', 'days-left', isBaySort);
  const [jobSort, setJobSort] = usePersistedState<JobSort>('jedidiah-job-sort', 'days-left', isJobSort);
  const isBays = listMode === 'bays';
  const state = isBays ? bayState : jobState;

  let sortControl = null;
  if (state.status === 'ready') {
    sortControl = isBays ? (
      <SegmentedSortControl onChange={setBaySort} options={BAY_SORT_OPTIONS} value={baySort} />
    ) : (
      <SegmentedSortControl onChange={setJobSort} options={JOB_SORT_OPTIONS} value={jobSort} />
    );
  }

  return (
    <View className="gap-4">
      <ListControlRow
        leading={<ListModeControl onToggle={onToggleListMode} title={isBays ? 'Bays' : 'Jobs'} />}
        trailing={sortControl}
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
        <BoardGrid items={SKELETON_KEYS} keyOf={(key) => key} renderItem={() => <SkeletonCard />} />
      ) : isBays && bayState.status === 'ready' ? (
        bayState.cards.length === 0 ? (
          <Text className="text-sm text-muted-foreground">No enabled bays yet.</Text>
        ) : (
          <BoardGrid
            items={sortBayCards(bayState.cards, baySort)}
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
            items={sortJobCards(jobState.cards, jobSort)}
            keyOf={(job) => job.jobId}
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

/** Tappable fixed-height control that flips Bays ⇄ Jobs in place. */
function ListModeControl({ onToggle, title }: { onToggle: () => void; title: string }) {
  return (
    <Pressable
      accessibilityHint="Switches between the Bays and Jobs views"
      accessibilityRole="button"
      className="h-10 max-w-full self-start flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3 active:bg-muted"
      onPress={onToggle}
    >
      <Text className="min-w-0 shrink text-[15px] text-foreground" numberOfLines={1} weight="bold">
        {title}
      </Text>
      <Icon className="shrink-0 text-muted-foreground" icon={IconArrowsLeftRight} size={15} />
    </Pressable>
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
