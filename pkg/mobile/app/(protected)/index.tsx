import { RefreshControl, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BayList } from '@/components/bays/BayList';
import { ProfileHeader } from '@/components/ProfileHeader';
import { useBayList } from '@/lib/use-bay-list';
import { useColorMode } from '@/theme/use-color-mode';

// Neutral spinner colours per scheme (matches `--color-muted-foreground`), since
// RefreshControl paints from concrete colour props rather than NativeWind classes.
const REFRESH_TINT = { dark: '#7a7a82', light: '#737373' } as const;

/**
 * Bay List landing screen: the shared profile header over the responsive Bays
 * grid. The protected layout guarantees a resolved session by the time we render.
 * Owns the Bay data so the whole page pulls to refresh.
 */
export default function IndexRoute() {
  const { resolved } = useColorMode();
  const { state, refresh, isRefreshing } = useBayList();
  const tint = REFRESH_TINT[resolved];

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerClassName="w-full gap-6 px-4 pb-8 pt-4"
        refreshControl={
          <RefreshControl colors={[tint]} onRefresh={refresh} refreshing={isRefreshing} tintColor={tint} />
        }
      >
        <ProfileHeader />
        <BayList state={state} />
      </ScrollView>
    </SafeAreaView>
  );
}
