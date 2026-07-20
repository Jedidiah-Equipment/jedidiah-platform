import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoardList, isListMode, type ListMode } from '@/components/bays/BoardList';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RefreshControl } from '@/components/ui/refresh-control';
import { useBayList } from '@/lib/use-bay-list';
import { useGlobalRefresh } from '@/lib/use-global-refresh';
import { useJobList } from '@/lib/use-job-list';
import { usePersistedState } from '@/lib/use-persisted-state';

/**
 * Shop-floor landing screen: the shared profile header over the responsive board, which the
 * title taps flip between Bays and Jobs. Both lists read the same cached schedule, so the persisted
 * toggle is instant and not deep-linkable. The protected layout guarantees a resolved session by
 * the time we render. Owns the board data so the whole page pulls to refresh.
 */
export default function IndexRoute() {
  const [listMode, setListMode] = usePersistedState<ListMode>('jedidiah-board-list-mode', 'bays', isListMode);
  const bayList = useBayList();
  const jobList = useJobList();
  const refresh = useGlobalRefresh();
  const bayCount = bayList.state.status === 'ready' ? bayList.state.cards.length : null;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="mx-auto w-full max-w-[1180px] gap-5 px-4 pb-8 pt-4"
        refreshControl={<RefreshControl {...refresh} />}
      >
        <ScreenHeader
          subtitle={bayCount === null ? 'Loading schedule…' : `${bayCount} ${bayCount === 1 ? 'bay' : 'bays'}`}
          title="Schedule"
        />
        <BoardList
          bayState={bayList.state}
          jobState={jobList.state}
          listMode={listMode}
          onToggleListMode={() => setListMode(listMode === 'bays' ? 'jobs' : 'bays')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
