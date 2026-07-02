import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BayQueueScreen } from '@/components/bays/BayQueueScreen';

/**
 * Bay schedule route: the responsive master–detail screen for the selected Bay —
 * the ACTIVE NOW + UP NEXT list pane (#519) and the Job Slot detail pane (#520).
 */
export default function BayScheduleRoute() {
  const router = useRouter();
  const { bayId } = useLocalSearchParams<{ bayId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <BayQueueScreen bayId={bayId} onBack={() => router.back()} />
    </SafeAreaView>
  );
}
