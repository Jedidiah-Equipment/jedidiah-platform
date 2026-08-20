import { IconChevronDown, IconChevronUp } from '@tabler/icons-react-native';
import { type ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * A detail card whose body hides behind its heading, for long lists that would otherwise push the
 * rest of a detail page off screen. The heading is the toggle and keeps rendering its `TITLE · N`
 * count while collapsed, so the card still says how much it holds.
 */
export function CardCollapse({
  children,
  headerAccessory,
  title,
}: {
  children: ReactNode;
  /** Rendered between the heading and the chevron — for a status that has to survive collapsing. */
  headerAccessory?: ReactNode;
  /** Card heading, rendered uppercase; carry any count in it, e.g. `Assemblies · 14`. */
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Pressable
        accessibilityHint={isOpen ? 'Hides this card’s content' : 'Shows this card’s content'}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="flex-row items-center gap-3 active:opacity-70"
        onPress={() => setIsOpen((open) => !open)}
      >
        <Text className="min-w-0 flex-1 text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
          {title}
        </Text>
        {headerAccessory}
        <Icon className="text-muted-foreground" icon={isOpen ? IconChevronUp : IconChevronDown} size={18} />
      </Pressable>
      {isOpen ? <View className="mt-3">{children}</View> : null}
    </View>
  );
}
