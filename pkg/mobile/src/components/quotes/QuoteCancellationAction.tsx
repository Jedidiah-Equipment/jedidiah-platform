import { shouldOfferQuoteCancellation } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';
import { IconTrash } from '@tabler/icons-react-native';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

/**
 * The device's way into cancelling a Locked Quote, whose Status field is closed and so cannot be the
 * route it is for an unlocked one. It lives in page content because the toolbar is reserved from
 * page-specific actions; the confirmation it opens is the same one Status opens.
 */
export function QuoteCancellationAction({
  canCancel,
  onPress,
  quote,
}: {
  canCancel: boolean;
  onPress: () => void;
  quote: QuoteDetail;
}) {
  if (!shouldOfferQuoteCancellation({ canCancel, quote })) {
    return null;
  }

  return (
    <View className="items-start">
      <Pressable
        accessibilityRole="button"
        className="h-11 flex-row items-center gap-2 rounded-xl bg-danger px-4 active:opacity-80"
        onPress={onPress}
      >
        <Icon className="text-danger-foreground" icon={IconTrash} size={16} />
        <Text className="text-sm text-danger-foreground" weight="bold">
          Cancel Quote
        </Text>
      </Pressable>
    </View>
  );
}
