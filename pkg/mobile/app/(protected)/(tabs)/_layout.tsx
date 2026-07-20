import { IconCalendarEvent, IconFileText, IconTractor } from '@tabler/icons-react-native';
import { Tabs } from 'expo-router';

import { showTabBar, visibleTabs } from '@/lib/app-tabs';
import { useAccess } from '@/lib/use-access';
import { loadingSpinnerColor } from '@/theme/brand-colors';
import { navigationColors } from '@/theme/gluestack-config';
import { useColorMode } from '@/theme/use-color-mode';

/** Permission-aware app tabs. A single visible tab collapses the bar entirely. */
export default function AppTabsLayout() {
  const access = useAccess();
  const tabs = visibleTabs(access.data);
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];

  return (
    <Tabs
      initialRouteName="(schedule)"
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: loadingSpinnerColor,
        tabBarHideOnKeyboard: true,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarLabelStyle: { fontFamily: 'monospace', fontSize: 10, letterSpacing: 0.6 },
        tabBarStyle: showTabBar(tabs)
          ? {
              backgroundColor: colors.tabBarBackground,
              borderTopColor: colors.border,
              height: 66,
              paddingBottom: 8,
              paddingTop: 8,
            }
          : { display: 'none' },
      }}
    >
      <Tabs.Screen
        name="(schedule)"
        options={{
          href: tabs.includes('schedule') ? undefined : null,
          tabBarIcon: ({ color, size }) => <IconCalendarEvent color={color} size={size} strokeWidth={1.8} />,
          title: 'SCHEDULE',
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          href: tabs.includes('quotes') ? undefined : null,
          tabBarIcon: ({ color, size }) => <IconFileText color={color} size={size} strokeWidth={1.8} />,
          title: 'QUOTES',
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          href: tabs.includes('products') ? undefined : null,
          tabBarIcon: ({ color, size }) => <IconTractor color={color} size={size} strokeWidth={1.8} />,
          title: 'PRODUCTS',
        }}
      />
    </Tabs>
  );
}
