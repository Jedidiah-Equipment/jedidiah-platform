import { Tabs } from 'expo-router';
import { ContractingTabBar } from '@/contracting/components/ContractingTabBar';
import { CONTRACTING_TAB_LABEL, visibleContractingTabs } from '@/contracting/lib/app-tabs';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { navigationColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

export default function ContractingTabsLayout() {
  const access = useSessionAccessSummary();
  const tabs = visibleContractingTabs(access);
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
        options={{ href: tabs.includes('jobs') ? undefined : null, title: CONTRACTING_TAB_LABEL.jobs }}
      />
      <Tabs.Screen
        name="machines"
        options={{ href: tabs.includes('machines') ? undefined : null, title: CONTRACTING_TAB_LABEL.machines }}
      />
      <Tabs.Screen
        name="workshop"
        options={{ href: tabs.includes('workshop') ? undefined : null, title: CONTRACTING_TAB_LABEL.workshop }}
      />
      <Tabs.Screen name="notes" options={{ title: CONTRACTING_TAB_LABEL.notes }} />
    </Tabs>
  );
}
