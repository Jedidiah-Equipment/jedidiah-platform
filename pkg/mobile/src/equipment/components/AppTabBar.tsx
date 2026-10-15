import {
  IconActivity,
  IconBarcode,
  IconBriefcase2,
  IconBuildingWarehouse,
  IconCalendar,
  IconFileText,
  IconPackages,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { useSegments } from 'expo-router';

import { useActivityUnread } from '@/components/activity/use-activity-unread';
import { TabBar } from '@/components/tab-bar/TabBar';
import { type AppTab, activeAppTab, appTabHref, appTabLabel, visibleTabs } from '@/equipment/lib/app-tabs';
import { useTRPC } from '@/lib/trpc';
import { useAccess } from '@/lib/use-access';

const TAB_ICONS = {
  activity: IconActivity,
  jobs: IconBriefcase2,
  plan: IconCalendar,
  products: IconPackages,
  quotes: IconFileText,
  stores: IconBarcode,
  units: IconBuildingWarehouse,
} as const satisfies Record<AppTab, TablerIcon>;

/**
 * Permission-aware bottom bar. Tabs share the bar evenly, and whichever trailing tabs would have
 * to truncate their label at the current width collapse into a MORE menu instead
 * (see {@link fitAppTabs}). A single visible tab collapses the bar entirely.
 */
export function AppTabBar() {
  const access = useAccess();
  const trpc = useTRPC();
  const tabs = visibleTabs(access.data);
  const activityUnread = useActivityUnread({
    enabled: tabs.includes('activity'),
    lastSeen: trpc.jobActivity.getLastActivitySeen.queryOptions(),
    latest: trpc.jobActivity.list.queryOptions({ limit: 1 }),
  });
  const segments = useSegments();
  const active = activeAppTab(segments);
  return (
    <TabBar
      activeKey={active}
      tabs={tabs.map((tab) => ({
        key: tab,
        label: appTabLabel(tab),
        icon: TAB_ICONS[tab],
        href: appTabHref(tab),
        badge: tab === 'activity' && activityUnread,
        badgeLabel: 'unread activity',
      }))}
    />
  );
}
