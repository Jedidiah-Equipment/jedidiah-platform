import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { ActivityIndicator, Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { accentActionColor } from '@/theme/brand-colors';
import { useColorMode } from '@/theme/use-color-mode';

/**
 * The primary-tinted card action — Send Feedback and the Fabrication stamps — for the one call a
 * card is asking the reader to make. Light mode can't paint the brand primary on a light surface and
 * stay legible, so it takes the darkened accent from the brand palette; dark mode uses the token.
 */
export function AccentButton({
  icon: IconComponent,
  label,
  onPress,
  pending = false,
}: {
  icon: TablerIcon;
  label: string;
  onPress: () => void;
  pending?: boolean;
}) {
  const { resolved } = useColorMode();
  const isDark = resolved === 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: pending }}
      className={`flex-row items-center justify-center gap-2 rounded-xl border bg-primary/10 px-4 py-3.5 ${
        isDark ? 'border-primary/60' : ''
      } ${pending ? 'opacity-60' : 'active:bg-primary/15'}`}
      disabled={pending}
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
