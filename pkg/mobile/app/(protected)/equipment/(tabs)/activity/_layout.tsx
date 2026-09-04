import { Redirect, Stack } from 'expo-router';

import { TabAccessErrorScreen, TabAccessLoadingScreen } from '@/equipment/components/TabAccessLoadingScreen';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useCan } from '@/lib/use-access';

/** Owns the Job read gate for the cross-Job Activity feed. */
export default function ActivityLayout() {
  const access = useCan('equipment_job:read');

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.activity} title="Activity" />;
  }

  if (access.isLoadingError) {
    return (
      <TabAccessErrorScreen onRetry={() => void access.refetch()} parent={MAIN_TAB_PARENTS.activity} title="Activity" />
    );
  }

  if (!access.can) return <Redirect href="/" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
