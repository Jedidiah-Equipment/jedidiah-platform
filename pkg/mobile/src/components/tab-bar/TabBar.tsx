import { IconDots, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Text } from '@/components/ui/text';
import { navigationColors } from '@/theme/gluestack-config';
import { useBrandForegroundColor } from '@/theme/use-brand-foreground';
import { useColorMode } from '@/theme/use-color-mode';

import { fitAppTabs, OVERFLOW_TAB_LABEL } from './tab-bar-fit';

export type TabBarTab = {
  key: string;
  label: string;
  icon: TablerIcon;
  href: Href;
  badge?: boolean;
  badgeLabel?: string;
};

const TAB_BAR_HEIGHT = 66;
const LABEL_STYLE = { fontSize: 10, letterSpacing: 0.6 } as const;
const MENU_LABEL_STYLE = { fontSize: 11, letterSpacing: 0.6 } as const;

/** Business-blind bottom navigation shared by Equipment and Contracting. */
export function TabBar({ tabs, activeKey }: { tabs: readonly TabBarTab[]; activeKey: string | null }) {
  const { resolved } = useColorMode();
  const colors = navigationColors[resolved];
  const activeTint = useBrandForegroundColor();
  const insets = useSafeAreaInsets();
  const keyboardShown = useKeyboardShown();
  const [width, setWidth] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const { visible, overflow } = fitAppTabs(tabs, width);
  const hasOverflow = overflow.length > 0;

  useEffect(() => {
    if (!hasOverflow) setMenuOpen(false);
  }, [hasOverflow]);

  if (tabs.length <= 1 || keyboardShown) return null;

  const tintFor = (tab: TabBarTab) => (tab.key === activeKey ? activeTint : colors.mutedForeground);
  const openTab = (tab: TabBarTab) => {
    setMenuOpen(false);
    router.navigate(tab.href);
  };

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        backgroundColor: colors.tabBarBackground,
        borderTopColor: colors.border,
        borderTopWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        height: TAB_BAR_HEIGHT + insets.bottom,
        paddingBottom: 8 + insets.bottom,
        paddingTop: 8,
      }}
    >
      {visible.map((tab) => (
        <TabBarSlot
          color={tintFor(tab)}
          icon={tab.icon}
          key={tab.key}
          label={tab.label}
          badge={tab.badge}
          badgeLabel={tab.badgeLabel}
          onPress={() => openTab(tab)}
          selected={tab.key === activeKey}
        />
      ))}

      {hasOverflow ? (
        <TabBarSlot
          color={overflow.some((tab) => tab.key === activeKey) ? activeTint : colors.mutedForeground}
          icon={IconDots}
          label={OVERFLOW_TAB_LABEL}
          onPress={() => setMenuOpen(true)}
          selected={menuOpen}
          badge={overflow.some((tab) => tab.badge)}
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
              const TabIcon = tab.icon;
              return (
                <Pressable
                  accessibilityLabel={tab.badge ? `${tab.label}, ${tab.badgeLabel ?? 'needs attention'}` : tab.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab.key === activeKey }}
                  className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
                  key={tab.key}
                  onPress={() => openTab(tab)}
                >
                  <View>
                    <TabIcon color={tintFor(tab)} size={20} strokeWidth={1.8} />
                    {tab.badge ? <TabBadge /> : null}
                  </View>
                  <Text mono style={[MENU_LABEL_STYLE, { color: tintFor(tab) }]}>
                    {tab.label}
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
  badge = false,
  badgeLabel = 'needs attention',
}: {
  color: string;
  icon: TablerIcon;
  label: string;
  onPress: () => void;
  selected: boolean;
  badge?: boolean;
  badgeLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badgeLabel}` : label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{ alignItems: 'center', flex: 1, gap: 4, justifyContent: 'center', paddingHorizontal: 4 }}
    >
      <View>
        <TabIcon color={color} size={24} strokeWidth={1.8} />
        {badge ? <TabBadge /> : null}
      </View>
      <Text mono numberOfLines={1} style={[LABEL_STYLE, { color }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function TabBadge() {
  return <View className="absolute -right-1 -top-0.5 size-2 rounded-full bg-orange-500" />;
}

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
