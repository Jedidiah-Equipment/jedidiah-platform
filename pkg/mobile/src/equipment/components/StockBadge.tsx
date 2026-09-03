import { statusBadgeColorClassNames } from '@pkg/domain';
import { View } from 'react-native';

import { StatusBadge } from '@/components/ui/status-badge';

/** The shared marker for a Product Unit that Jedidiah still holds rather than a Customer owning it. */
export function StockBadge({ size = 'standard' }: { size?: 'compact' | 'standard' }) {
  return (
    <View className="self-start">
      <StatusBadge classNames={statusBadgeColorClassNames.yellow} label="Stock" size={size} />
    </View>
  );
}
