import { hasUnreadActivity } from '@pkg/domain';
import {
  IconActivity,
  IconBarcode,
  IconBriefcase2,
  IconBuildingWarehouse,
  IconCalendar,
  IconDots,
  IconFileText,
  IconPackages,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Text } from '@/components/ui/text';
import { type AppTab, activeAppTab, appTabHref, appTabLabel, showTabBar, visibleTabs } from '@/equipment/lib/app-tabs';
import { fitAppTabs, OVERFLOW_TAB_LABEL } from '@/equipment/lib/tab-bar-fit';
import { useTRPC } from '@/lib/trpc';
import { useAccess } from '@/lib/use-access';
import { navigationColors } from '@/theme/gluestack-config';
import { useBrandForegroundColor } from '@/theme/use-brand-foreground';
import { useColorMode } from '@/theme/use-color-mode';

const TAB_ICONS = {
  activity: IconActivity,
  jobs: IconBriefcase2,
  plan: IconCalendar,
  products: IconPackages,
  quotes: IconFileText,
  stores: IconBarcode,
  units: IconBuildingWarehouse,
} as const satisfies Record<AppTab, TablerIcon>;

/** Bar height above the safe-area inset; the overflow menu hangs off the same number. */
const TAB_BAR_HEIGHT = 66;
const LABEL_STYLE = { fontSize: 10, letterSpacing: 0.6 } as const;
// The menu has room the bar does not, so its entries read one step larger.
const MENU_LABEL_STYLE = { fontSize: 11, letterSpacing: 0.6 } as const;
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
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];
  const activeTint = useBrandForegroundColor();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();
  const [width, setWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const { visible, overflow } = fitAppTabs(tabs, width);
  const hasOverflow = overflow.length > 0;

  // A width change can empty the overflow while its menu is open — rotating and entering split
  // screen both re-fit the bar — and the menu would then hold nothing, with the button that closes
  // it already unmounted. The render below guards the same frame; this clears the state behind it.
  useEffect(() => {
    if (!hasOverflow) setMenuOpen(false);
  }, [hasOverflow]);

  if (!showTabBar(tabs) || keyboardShown) return null;

  const tintFor = (tab: AppTab) => (tab === active ? activeTint : colors.mutedForeground);
  const openTab = (tab: AppTab) => {
    setMenuOpen(false);
    router.navigate(appTabHref(tab));
  };

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        backgroundColor: colors.tabBarBackground,
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        // Explicit dimensions keep the bar's height off React Navigation's automatic inset sizing.
        height: TAB_BAR_HEIGHT + insets.bottom,
        paddingBottom: 8 + insets.bottom,
        paddingTop: 8,
      }}
    >
      {visible.map((tab) => (
        <TabBarSlot
          color={tintFor(tab)}
          icon={TAB_ICONS[tab]}
          key={tab}
          label={appTabLabel(tab)}
          unread={tab === 'activity' && activityUnread}
          onPress={() => openTab(tab)}
          selected={tab === active}
        />
      ))}

      {hasOverflow ? (
        <TabBarSlot
          // The menu owns the active tab whenever the current one is hidden inside it.
          color={overflow.some((tab) => tab === active) ? activeTint : colors.mutedForeground}
          icon={IconDots}
          label={OVERFLOW_TAB_LABEL}
          onPress={() => setMenuOpen(true)}
          selected={menuOpen}
          unread={overflow.includes('activity') && activityUnread}
        />
      ) : null}

      {menuOpen && hasOverflow ? (
        <AnchoredMenu
          dismissLabel="Dismiss more tabs"
          onClose={() => setMenuOpen(false)}
          style={{ bottom: TAB_BAR_HEIGHT + insets.bottom + 8, right: 12, width: 200 }}
        >
          <View className="p-1.5">
            {overflow.map((tab) => {
              const TabIcon = TAB_ICONS[tab];

              return (
                <Pressable
                  accessibilityLabel={
                    tab === 'activity' && activityUnread ? `${appTabLabel(tab)}, unread activity` : appTabLabel(tab)
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab === active }}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
                  key={tab}
                  onPress={() => openTab(tab)}
                >
                  <View>
                    <TabIcon color={tintFor(tab)} size={20} strokeWidth={1.8} />
                    {tab === 'activity' && activityUnread ? <UnreadActivityDot /> : null}
                  </View>
                  <Text mono style={[MENU_LABEL_STYLE, { color: tintFor(tab) }]}>
                    {appTabLabel(tab)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </AnchoredMenu>
      ) : null}
    </View>
  );
}

function TabBarSlot({
  color,
  icon: TabIcon,
  label,
  onPress,
  selected,
  unread = false,
}: {
  color: string;
  icon: TablerIcon;
  label: string;
  onPress: () => void;
  selected: boolean;
  unread?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `${label}, unread activity` : label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ alignItems: 'center', flex: 1, gap: 4, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <View>
        <TabIcon color={color} size={24} strokeWidth={1.8} />
        {unread ? <UnreadActivityDot /> : null}
      </View>
      <Text mono numberOfLines={1} style={[LABEL_STYLE, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function UnreadActivityDot() {
  return <View className="absolute -right-1 -top-0.5 size-2 rounded-full bg-orange-500" />;
}

/** Stands in for the default bar's `tabBarHideOnKeyboard`, which only ships with that bar. */
function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () =>
      setShown(true),
    );
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
      setShown(false),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return shown;
}
