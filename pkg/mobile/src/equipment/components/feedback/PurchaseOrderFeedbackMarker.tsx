import { type FeedbackPurchaseOrder, formatPurchaseOrderCode } from '@pkg/schema/equipment';
import { IconShoppingCart } from '@tabler/icons-react-native';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useColorMode } from '@/theme/use-color-mode';

export function PurchaseOrderFeedbackMarker({ purchaseOrder }: { purchaseOrder: FeedbackPurchaseOrder }) {
  const { resolved } = useColorMode();
  const textClassName = resolved === 'dark' ? 'text-amber-200' : 'text-amber-800';
  return (
    <View className="flex-row items-center gap-1 rounded bg-amber-500/10 px-2 py-1">
      <Icon className={textClassName} icon={IconShoppingCart} size={13} />
      <Text className={`flex-1 text-xs ${textClassName}`}>
        {formatPurchaseOrderCode(purchaseOrder.code)} · {purchaseOrder.supplierName}
      </Text>
    </View>
  );
}
