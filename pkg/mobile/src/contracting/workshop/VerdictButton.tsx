import type { BreakdownActionVerdict } from '@pkg/schema/contracting';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';

/**
 * A Breakdown Action as a button: absent for someone the action is never theirs to take, otherwise shown, and
 * when refused for now it is disabled with the refusal's sentence under it (the phone's stand-in for web's title).
 */
export function VerdictButton({
  verdict,
  title,
  primary,
  busy = false,
  onPress,
}: {
  verdict: BreakdownActionVerdict;
  title: string;
  primary?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  if (!verdict.allowed && verdict.reason === 'no-permission') return null;
  return (
    <View className="gap-1">
      <Button
        primary={primary && verdict.allowed}
        title={title}
        disabled={busy || !verdict.allowed}
        onPress={onPress}
      />
      {verdict.allowed ? null : <Text className="text-sm text-muted-foreground">{verdict.message}</Text>}
    </View>
  );
}
