import { warningMessageFor } from '@pkg/domain/equipment';
import type { StockMovementWarningCode } from '@pkg/schema/equipment';
import { IconAlertTriangle } from '@tabler/icons-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';

/**
 * What the ledger thinks of a movement — before it posts, and again afterwards if the post found
 * something the preview could not see.
 *
 * The preview is honest because it does not compute a threshold of its own: the figures a warning is
 * judged against are served by the same read that fills the screen, and `deriveMovementWarnings`
 * judges them here exactly as the post judges them under its lock. Those figures do move under a
 * shared device between one scan and the next, which is why the post stays authoritative and why
 * anything it adds comes back through `mode="posted"` — but a warning is worth most at the moment
 * someone is about to do the surprising thing, not after.
 *
 * A movement is still an append-only fact rather than a request (spec §2): confirming posts it, and
 * declining posts nothing at all rather than recording a refusal.
 */
export function MovementWarningModal({
  mode,
  onClose,
  onConfirm,
  warnings,
}: {
  /** `confirm` asks before posting; `posted` reports what the post added on top of that. */
  mode: 'confirm' | 'posted';
  onClose: () => void;
  onConfirm?: () => void;
  warnings: readonly StockMovementWarningCode[];
}) {
  const isConfirm = mode === 'confirm';

  return (
    <ThemedModal backdropLabel="Dismiss the warning" onClose={onClose} open={warnings.length > 0}>
      <View className="w-full max-w-[520px] gap-4 rounded-2xl border border-border bg-surface p-5">
        <View className="flex-row items-center gap-3">
          <Icon className="text-danger" icon={IconAlertTriangle} size={26} />
          <Text className="text-xl text-surface-foreground" weight="bold">
            Check this movement
          </Text>
        </View>
        <View className="gap-2">
          {warnings.map((warning) => (
            <Text className="text-base text-surface-foreground" key={warning}>
              • {warningMessageFor(warning)}
            </Text>
          ))}
        </View>
        <Text className="text-sm text-muted-foreground">
          {isConfirm
            ? 'You can still post this movement.'
            : 'It has been posted. Tell the office if this was not what you meant to do.'}
        </Text>
        <View className="gap-2">
          <Pressable
            accessibilityRole="button"
            className="items-center rounded-xl bg-primary px-4 py-3"
            onPress={isConfirm ? onConfirm : onClose}
          >
            <Text className="text-sm text-primary-foreground" weight="semibold">
              {isConfirm ? 'Post anyway' : 'Got it'}
            </Text>
          </Pressable>
          {isConfirm ? (
            <Pressable
              accessibilityRole="button"
              className="items-center rounded-xl border border-border px-4 py-3"
              onPress={onClose}
            >
              <Text className="text-sm text-surface-foreground" weight="semibold">
                Go back
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </ThemedModal>
  );
}
