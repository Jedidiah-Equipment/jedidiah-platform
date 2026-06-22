import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BayList } from '@/components/bays/BayList';
import { ProfileHeader } from '@/components/ProfileHeader';

/**
 * Bay List landing screen: the shared profile header over the responsive Bays
 * grid. The protected layout guarantees a resolved session by the time we render.
 */
export default function IndexRoute() {
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <ScrollView contentContainerClassName="w-full gap-6 px-4 pb-8 pt-4">
        <ProfileHeader />
        <BayList />
      </ScrollView>
    </SafeAreaView>
  );
}
