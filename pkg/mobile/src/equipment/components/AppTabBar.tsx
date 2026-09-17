import { hasUnreadActivity } from '@pkg/domain/equipment';
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
import { useQuery } from '@tanstack/react-query';
import { useSegments } from 'expo-router';

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

const ACTIVITY_INDICATOR_REFETCH_INTERVAL_MS = 60_000;

/**
 * Permission-aware bottom bar. Tabs share the bar evenly, and whichever trailing tabs would have
 * to truncate their label at the current width collapse into a MORE menu instead
 * (see {@link fitAppTabs}). A single visible tab collapses the bar entirely.
 */
export function AppTabBar() {
  const access = useAccess();
  const trpc = useTRPC();
  const tabs = visibleTabs(access.data);
  const activityVisible = tabs.includes('activity');
  const lastSeenQuery = useQuery({
    ...trpc.jobActivity.getLastActivitySeen.queryOptions(),
    enabled: activityVisible,
    refetchInterval: ACTIVITY_INDICATOR_REFETCH_INTERVAL_MS,
  });
  const latestActivityQuery = useQuery({
    ...trpc.jobActivity.list.queryOptions({ limit: 1 }),
    enabled: activityVisible,
    refetchInterval: ACTIVITY_INDICATOR_REFETCH_INTERVAL_MS,
  });
  const activityUnread =
    lastSeenQuery.data !== undefined &&
    hasUnreadActivity({
      lastActivitySeen: lastSeenQuery.data,
      latestActivityAt: latestActivityQuery.data?.items[0]?.occurredAt ?? null,
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
      }))}
    />
  );
}
