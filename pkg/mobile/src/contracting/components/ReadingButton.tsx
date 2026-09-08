import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
export function ReadingButton({
  title,
  onPress,
  disabled = false,
  primary = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      className={`rounded-xl border border-border px-4 py-3 ${primary ? 'bg-primary' : 'bg-surface'} ${disabled ? 'opacity-50' : ''}`}
      onPress={onPress}
    >
      <Text
        className={`text-center text-sm ${primary ? 'text-primary-foreground' : 'text-foreground'}`}
        weight="semibold"
      >
        {title}
      </Text>
    </Pressable>
  );
}
