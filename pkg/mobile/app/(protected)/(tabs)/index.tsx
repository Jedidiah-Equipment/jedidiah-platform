import { type Href, Redirect } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabAccessErrorScreen, TabAccessLoadingScreen } from '@/components/TabAccessLoadingScreen';
import { MainTabToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { appTabHref, visibleTabs } from '@/lib/app-tabs';
import { MAIN_TAB_PARENTS } from '@/lib/toolbar-navigation';
import { useAccess } from '@/lib/use-access';

/** Permission-aware signed-in landing; Jobs is first whenever the user can read Jobs. */
export default function SignedInIndexRoute() {
  const access = useAccess();

  if (access.isPending) {
    return <TabAccessLoadingScreen parent={MAIN_TAB_PARENTS.jobs} title="Jobs" />;
  }

  if (access.isLoadingError) {
    return <TabAccessErrorScreen onRetry={() => void access.refetch()} parent={MAIN_TAB_PARENTS.jobs} title="Jobs" />;
  }

  const [firstTab] = visibleTabs(access.data);
  if (firstTab) return <Redirect href={appTabHref(firstTab) as Href} />;

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <MainTabToolbar
        assistantParent={MAIN_TAB_PARENTS.jobs}
        subtitle="ACCOUNT HAS NO MOBILE TABS"
        title="No mobile access"
      />
      <View className="w-full gap-2 px-4 py-8">
        <Text className="text-lg text-foreground" weight="bold">
          No mobile access
        </Text>
        <Text className="text-sm text-muted-foreground">
          Your account does not have access to Jobs, Plan, Stores, Quotes, Products, or Units.
        </Text>
      </View>
    </SafeAreaView>
  );
}
