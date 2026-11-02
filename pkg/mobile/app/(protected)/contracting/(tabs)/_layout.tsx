import { Tabs } from 'expo-router';
import { ContractingTabBar } from '@/contracting/components/ContractingTabBar';
import { CONTRACTING_TAB_LABEL, CONTRACTING_TABS, visibleContractingTabs } from '@/contracting/lib/app-tabs';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { navigationColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

export const unstable_settings = { anchor: '(activity)' };

export default function ContractingTabsLayout() {
  const access = useSessionAccessSummary();
  const tabs = visibleContractingTabs(access);
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={() => <ContractingTabBar />}
    >
      {CONTRACTING_TABS.map((tab) => (
        <Tabs.Screen
          key={tab}
          name={`(${tab})`}
          options={{ href: tabs.includes(tab) ? undefined : null, title: CONTRACTING_TAB_LABEL[tab] }}
        />
      ))}
    </Tabs>
  );
}
