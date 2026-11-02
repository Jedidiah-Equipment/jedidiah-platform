import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BayQueueScreen } from '@/equipment/components/bays/BayQueueScreen';

/** Existing Bay schedule, now owned by the root Plan tab. */
export default function BayScheduleRoute() {
  const _router = useRouter();
  const { bayId } = useLocalSearchParams<{ bayId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <BayQueueScreen bayId={bayId} />
    </SafeAreaView>
  );
}
