import { Tabs } from 'expo-router';
import { ContractingTabBar } from '@/contracting/components/ContractingTabBar';
import { contractingTabLabel, visibleContractingTabs } from '@/contracting/lib/app-tabs';
import { useAccess } from '@/lib/use-access';
import { navigationColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

export default function ContractingTabsLayout() {
  const access = useAccess();
  const tabs = visibleContractingTabs(access.data);
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];
  return (
    <Tabs
      initialRouteName="jobs"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={() => <ContractingTabBar />}
    >
      <Tabs.Screen
        name="jobs"
        options={{ href: tabs.includes('jobs') ? undefined : null, title: contractingTabLabel('jobs') }}
      />
      <Tabs.Screen
        name="machines"
        options={{ href: tabs.includes('machines') ? undefined : null, title: contractingTabLabel('machines') }}
      />
    </Tabs>
  );
}
