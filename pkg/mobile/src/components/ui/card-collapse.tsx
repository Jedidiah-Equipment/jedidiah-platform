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
  defaultOpen = false,
  headerAccessory,
  onOpenChange,
  open,
  title,
}: {
  children: ReactNode;
  /** Open a card on arrival when nothing else on that screen carries what it holds. */
  defaultOpen?: boolean;
  /** Rendered between the heading and the chevron — for a status that has to survive collapsing. */
  headerAccessory?: ReactNode;
  /** Reports the next state; pair with `open` when a parent owns persistence. */
  onOpenChange?: (open: boolean) => void;
  /** Controlled open state. Omit to retain the card's local state. */
  open?: boolean;
  /** Card heading, rendered uppercase by the heading style; carry any count in it. */
  title: string;
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  function toggleOpen() {
    const nextOpen = !isOpen;
    if (open === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <View className="rounded-2xl border border-border bg-surface">
      <Pressable
        accessibilityHint={isOpen ? 'Hides this card’s content' : 'Shows this card’s content'}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        className="flex-row items-center gap-3 p-4 active:opacity-70"
        onPress={toggleOpen}
      >
        <Text className="min-w-0 flex-1 text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
          {title}
        </Text>
        {headerAccessory}
        <Icon className="text-muted-foreground" icon={isOpen ? IconChevronUp : IconChevronDown} size={18} />
      </Pressable>
      {isOpen ? <View className="px-4 pb-4">{children}</View> : null}
    </View>
  );
}
