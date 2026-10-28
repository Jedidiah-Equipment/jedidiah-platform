import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { ActivityIndicator, Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { accentActionColor } from '@/theme/brand-colors';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * The primary-tinted card action — Send Feedback, Add Note and the Fabrication stamps — for the one call a
 * card is asking the reader to make. Light mode takes the accent from the brand palette (staging's is
 * darkened); dark mode uses the token.
 */
export function AccentButton({
  icon: IconComponent,
  label,
  onPress,
  pending = false,
  disabled = false,
  className = '',
}: {
  icon: TablerIcon;
  label: string;
  onPress: () => void;
  pending?: boolean;
  /** Refused for now: dimmed and inert, without the spinner `pending` shows. */
  disabled?: boolean;
  /** Layout from the parent, such as `flex-1` to share a row. */
  className?: string;
}) {
  const { resolved } = useColorMode();
  const isDark = resolved === 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: pending || disabled }}
      className={`flex-row items-center justify-center gap-2 rounded-xl border bg-primary/10 px-4 py-3.5 ${
        isDark ? 'border-primary/60' : ''
      } ${pending || disabled ? 'opacity-60' : 'active:bg-primary/15'} ${className}`}
      disabled={pending || disabled}
      onPress={onPress}
      style={isDark ? undefined : { borderColor: accentActionColor }}
    >
      {pending ? (
        <ActivityIndicator size="small" />
      ) : isDark ? (
        <Icon className="text-primary" icon={IconComponent} size={18} />
      ) : (
        <IconComponent color={accentActionColor} size={18} />
      )}
      <Text
        className={`text-sm ${isDark ? 'text-primary' : ''}`}
        style={isDark ? undefined : { color: accentActionColor }}
        weight="semibold"
      >
        {label}
      </Text>
    </Pressable>
  );
}
