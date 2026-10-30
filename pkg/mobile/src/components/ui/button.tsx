import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function Button({
  title,
  onPress,
  disabled = false,
  icon,
  primary = false,
  destructive = false,
  compact = false,
}: {
  title: string;
  icon?: TablerIcon;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  /** Danger-coloured text on the surface style, for an action that removes something. */
  destructive?: boolean;
  /** Tighter padding, for a button that rides in a list row. */
  compact?: boolean;
}) {
  const foreground = primary ? 'text-primary-foreground' : destructive ? 'text-danger' : 'text-foreground';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-2 rounded-xl border border-border ${compact ? 'px-3 py-2' : 'px-4 py-3'} ${primary ? 'bg-primary' : 'bg-surface'} ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
    >
      {icon ? <Icon className={foreground} icon={icon} size={16} /> : null}
      <Text className={`text-center text-sm ${foreground}`} weight="semibold">
        {title}
      </Text>
    </Pressable>
  );
}
