import { type Href, Tabs } from 'expo-router';

import { AppTabBar } from '@/components/AppTabBar';
import { appTabLabel, visibleTabs } from '@/lib/app-tabs';
import { useAccess } from '@/lib/use-access';
import { navigationColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

/** Permission-aware app tabs. {@link AppTabBar} owns which of them the bottom bar can show. */
export default function AppTabsLayout() {
  const access = useAccess();
  const tabs = visibleTabs(access.data);
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];

  return (
    <Tabs
      initialRouteName="activity"
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={() => <AppTabBar />}
    >
      <Tabs.Screen
        name="activity"
        options={{ href: tabs.includes('activity') ? undefined : null, title: appTabLabel('activity') }}
      />
      <Tabs.Screen
        name="jobs"
        options={{ href: tabs.includes('jobs') ? undefined : null, title: appTabLabel('jobs') }}
      />
      <Tabs.Screen
        name="(plan)"
        options={{ href: tabs.includes('plan') ? ('/plan' as Href) : null, title: appTabLabel('plan') }}
      />
      <Tabs.Screen
        name="quotes"
        options={{ href: tabs.includes('quotes') ? undefined : null, title: appTabLabel('quotes') }}
      />
      <Tabs.Screen
        name="products"
        options={{ href: tabs.includes('products') ? undefined : null, title: appTabLabel('products') }}
      />
      <Tabs.Screen
        name="units"
        options={{ href: tabs.includes('units') ? undefined : null, title: appTabLabel('units') }}
      />
      <Tabs.Screen
        name="stores"
        options={{ href: tabs.includes('stores') ? undefined : null, title: appTabLabel('stores') }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  );
}
