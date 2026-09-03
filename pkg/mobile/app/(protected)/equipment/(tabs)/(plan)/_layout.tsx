import { Redirect, Stack } from 'expo-router';

import { TabAccessErrorScreen, TabAccessLoadingScreen } from '@/equipment/components/TabAccessLoadingScreen';
import { MAIN_TAB_PARENTS } from '@/equipment/lib/toolbar-navigation';
import { useCan } from '@/lib/use-access';

/** Owns the Job read gate for the Plan catalog and existing Bay schedule screen. */
export default function PlanLayout() {
  const access = useCan('job:read');

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.plan} title="Plan" />;
  }

  if (access.isLoadingError) {
    return <TabAccessErrorScreen onRetry={() => void access.refetch()} parent={MAIN_TAB_PARENTS.plan} title="Plan" />;
  }

  if (!access.can) return <Redirect href="/" />;

  return <Stack initialRouteName="plan/index" screenOptions={{ headerShown: false }} />;
}
