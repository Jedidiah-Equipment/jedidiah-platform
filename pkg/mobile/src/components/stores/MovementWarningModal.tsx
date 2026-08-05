import type { StockMovementWarningCode } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';

const WARNING_MESSAGES = {
  'bom-deviation': 'This differs from what the BOM calls for.',
  'exceeds-cfo': 'This draw exceeds the Job CFO.',
  'exceeds-drawn': 'This return exceeds the quantity currently drawn.',
  'exceeds-ordered': 'This receipt takes the line past the quantity ordered.',
  'exceeds-received': 'This return sends back more than the line ever received.',
  'negative-stock-on-hand': 'This draw will take stock on hand negative.',
} as const satisfies Record<StockMovementWarningCode, string>;

/**
 * What the ledger thought of a movement, shown after it posted.
 *
 * These are the *server's* verdicts, verbatim — the tablet never re-derives them. It could not do so
 * honestly anyway: the figures a warning is judged against (what the Job has drawn, what the line
 * has taken in) move under a shared device between one scan and the next, so anything computed here
 * would be a guess dressed as a check.
 *
 * It appears after the post rather than before because a movement is an append-only fact, not a
 * request (spec §2): the stock has physically moved, and refusing to record it would only hide that.
 * A warning says "look at this", so this dialog stops the shift long enough to be read — which is
 * the whole difference between a warning and a toast that scrolls past on a busy dock.
 */
export function MovementWarningModal({
  onClose,
  warnings,
}: {
  onClose: () => void;
  warnings: readonly StockMovementWarningCode[];
}) {
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
              • {WARNING_MESSAGES[warning]}
            </Text>
          ))}
        </View>
        <Text className="text-sm text-muted-foreground">
          It has been posted. Tell the office if this was not what you meant to do.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="items-center rounded-xl bg-primary px-4 py-3"
          onPress={onClose}
        >
          <Text className="text-sm text-primary-foreground" weight="semibold">
            Got it
          </Text>
        </Pressable>
      </View>
    </ThemedModal>
  );
}
