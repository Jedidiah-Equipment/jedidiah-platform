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
}: {
  title: string;
  icon?: TablerIcon;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 ${primary ? 'bg-primary' : 'bg-surface'} ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
    >
      {icon ? <Icon className={primary ? 'text-primary-foreground' : 'text-foreground'} icon={icon} size={16} /> : null}
      <Text
        className={`text-center text-sm ${primary ? 'text-primary-foreground' : 'text-foreground'}`}
        weight="semibold"
      >
        {title}
      </Text>
    </Pressable>
  );
}
