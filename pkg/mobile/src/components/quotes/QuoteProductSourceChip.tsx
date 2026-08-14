import { quoteProductSourceColorClassNames, quoteProductSourceLabels } from '@pkg/domain';
import type { QuoteProductSource } from '@pkg/schema';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function QuoteProductSourceChip({ productSource }: { productSource: QuoteProductSource }) {
  const classNames = quoteProductSourceColorClassNames[productSource];

  return (
    <View className={`rounded-full border px-2 py-1 ${classNames.chip}`}>
      <Text className={`text-[10px] tracking-wide ${classNames.text}`} mono weight="semibold">
        {quoteProductSourceLabels[productSource]}
      </Text>
    </View>
  );
}
