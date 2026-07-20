import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobDetail } from '@/components/bays/JobDetail';

/**
 * Job Detail route, keyed by Job id and opened from a Job List card: the production-route timeline
 * and the product/progress/documents/facts detail pane. Back always dismisses to the Schedule root,
 * so retained cross-tab or browser history cannot take the user out of Schedule.
 */
export default function JobDetailRoute() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();
  const onBack = () => router.dismissTo('/');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <JobDetail jobId={jobId} onBack={onBack} />
    </SafeAreaView>
  );
}
