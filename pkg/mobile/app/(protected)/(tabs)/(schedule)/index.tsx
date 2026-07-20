import { Redirect } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoardList, isListMode, type ListMode } from '@/components/bays/BoardList';
import { ScreenHeader } from '@/components/ScreenHeader';
import { RefreshControl } from '@/components/ui/refresh-control';
import { Text } from '@/components/ui/text';
import { visibleTabs } from '@/lib/app-tabs';
import { useAccess } from '@/lib/use-access';
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
  const access = useAccess();
  const tabs = visibleTabs(access.data);
  const [listMode, setListMode] = usePersistedState<ListMode>('jedidiah-board-list-mode', 'bays', isListMode);
  const bayList = useBayList();
  const jobList = useJobList();
  const refresh = useGlobalRefresh();
  const bayCount = bayList.state.status === 'ready' ? bayList.state.cards.length : null;

  if (!access.isPending && !tabs.includes('schedule')) {
    if (tabs.includes('quotes')) return <Redirect href="/quotes" />;
    if (tabs.includes('products')) return <Redirect href="/products" />;

    return <SignedInNoAccessScreen />;
  }

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

function SignedInNoAccessScreen() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <View className="mx-auto w-full max-w-[1180px] gap-2 px-4 py-8">
        <Text className="text-lg text-foreground" weight="bold">
          No mobile access
        </Text>
        <Text className="text-sm text-muted-foreground">
          Your account does not have access to Schedule, Quotes, or Products.
        </Text>
      </View>
    </SafeAreaView>
  );
}
