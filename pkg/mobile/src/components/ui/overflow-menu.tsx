import { IconDots, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { useRef, useState } from 'react';
import { Dimensions, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export type OverflowMenuItem = { label: string; icon: TablerIcon; destructive?: boolean; onPress: () => void };

const MENU_WIDTH = 200;

/** A card's rarer actions behind a dots button, the menu opening above or below it, whichever has room. */
export function OverflowMenu({
  accessibilityLabel,
  items,
}: {
  accessibilityLabel: string;
  items: readonly OverflowMenuItem[];
}) {
  const anchor = useRef<ViewInstance>(null);
  const insets = useSafeAreaInsets();
  const [position, setPosition] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const open = () =>
    anchor.current?.measureInWindow((x, y, width, height) => {
      const window = Dimensions.get('window');
      const right = window.width - (x + width);
      const spaceBelow = window.height - insets.bottom - (y + height);
      setPosition(
        spaceBelow >= y - insets.top ? { top: y + height + 8, right } : { bottom: window.height - y + 8, right },
      );
    });
  return (
    <>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        className="items-center justify-center rounded-xl border border-border bg-surface px-4 active:bg-muted"
        onPress={open}
        ref={anchor}
      >
        <Icon className="text-foreground" icon={IconDots} size={18} />
      </Pressable>
      {position ? (
        <AnchoredMenu onClose={() => setPosition(null)} style={{ ...position, width: MENU_WIDTH }}>
          <View className="p-1.5">
            {items.map((item) => (
              <Pressable
                accessibilityRole="button"
                className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:bg-muted"
                key={item.label}
                onPress={() => {
                  setPosition(null);
                  item.onPress();
                }}
              >
                <Icon
                  className={item.destructive ? 'text-danger' : 'text-muted-foreground'}
                  icon={item.icon}
                  size={18}
                />
                <Text
                  className={`text-sm ${item.destructive ? 'text-danger' : 'text-surface-foreground'}`}
                  weight="semibold"
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </AnchoredMenu>
      ) : null}
    </>
  );
}
