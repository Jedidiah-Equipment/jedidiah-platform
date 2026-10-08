import { presentAction } from '@pkg/domain/contracting';
import type { BreakdownActionVerdict } from '@pkg/schema/contracting';
import type { Icon as TablerIcon } from '@tabler/icons-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CaptureButton } from '@/contracting/components/CaptureButton';

/**
 * Controls under one Breakdown Action verdict, read the way the domain presents it: absent for someone the action is
 * never theirs to take, otherwise shown, and when refused for now rendered disabled with the refusal's sentence under
 * them (the phone's stand-in for web's title).
 */
export function VerdictGroup({
  verdict,
  children,
}: {
  verdict: BreakdownActionVerdict;
  children: (disabled: boolean) => ReactNode;
}) {
  const action = presentAction(verdict);
  if (!action) return null;
  return (
    <View className="gap-1">
      {children(action.disabled)}
      {action.title ? <Text className="text-sm text-muted-foreground">{action.title}</Text> : null}
    </View>
  );
}

/** One Breakdown Action as a button, under its verdict. */
export function VerdictButton({
  verdict,
  title,
  icon,
  primary,
  capture = false,
  busy = false,
  onPress,
}: {
  verdict: BreakdownActionVerdict;
  title: string;
  icon?: TablerIcon;
  primary?: boolean;
  /** Draws it as a field capture moment, the way arrival and departure are captured; needs an icon. */
  capture?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <VerdictGroup verdict={verdict}>
      {(disabled) =>
        capture && icon ? (
          <CaptureButton icon={icon} label={title} disabled={busy || disabled} onPress={onPress} />
        ) : (
          <Button
            primary={primary && !disabled}
            title={title}
            icon={icon}
            disabled={busy || disabled}
            onPress={onPress}
          />
        )
      }
    </VerdictGroup>
  );
}
