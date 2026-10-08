import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import { Pressable } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * A start or stop moment in the field: capturing a Machine's arrival or departure, starting or completing workshop
 * work. Muted, with the play or stop glyph in the primary colour.
 */
export function CaptureButton({
  icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: TablerIcon;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={`flex-row items-center justify-center gap-2 rounded-lg border border-border bg-muted px-3 py-3 active:bg-surface ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
    >
      <Icon className="text-primary" icon={icon} size={16} />
      <Text className="text-sm text-foreground" weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}
