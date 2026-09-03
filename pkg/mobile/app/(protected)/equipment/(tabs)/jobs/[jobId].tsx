import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JobDetail } from '@/equipment/components/bays/JobDetail';

/** Existing Job detail, now owned by the root Jobs tab. */
export default function JobDetailRoute() {
  const router = useRouter();
  const { jobId } = useLocalSearchParams<{ jobId: string }>();

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <JobDetail jobId={jobId} onBack={() => router.dismissTo('/equipment/jobs' as Href)} />
    </SafeAreaView>
  );
}
