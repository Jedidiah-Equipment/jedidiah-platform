import { useState } from 'react';
import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoardList, type ListMode } from '@/components/bays/BoardList';
import { ProfileHeader } from '@/components/ProfileHeader';
import { useBayList } from '@/lib/use-bay-list';
import { useJobList } from '@/lib/use-job-list';
import { useColorMode } from '@/theme/use-color-mode';

// Neutral spinner colours per scheme (matches `--color-muted-foreground`), since
// RefreshControl paints from concrete colour props rather than NativeWind classes.
const REFRESH_TINT = { dark: '#7a7a82', light: '#737373' } as const;

/**
 * Shop-floor landing screen: the shared profile header over the responsive board, which the
 * title taps flip between Bays and Jobs. Both lists read the same cached schedule, so the toggle
 * is ephemeral UI state — instant and not deep-linkable. The protected layout guarantees a
 * resolved session by the time we render. Owns the board data so the whole page pulls to refresh.
 */
export default function IndexRoute() {
  const { resolved } = useColorMode();
  const [listMode, setListMode] = useState<ListMode>('bays');
  const bayList = useBayList();
  const jobList = useJobList();
  const tint = REFRESH_TINT[resolved];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="w-full gap-6 px-4 pb-8 pt-4"
        refreshControl={
          <RefreshControl
            colors={[tint]}
            onRefresh={bayList.refresh}
            refreshing={bayList.isRefreshing}
            tintColor={tint}
          />
        }
      >
        <ProfileHeader />
        <BoardList
          bayState={bayList.state}
          jobState={jobList.state}
          listMode={listMode}
          onToggleListMode={() => setListMode((mode) => (mode === 'bays' ? 'jobs' : 'bays'))}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
