import { quoteStatusColorClassNames, quoteStatusLabels } from '@pkg/domain';
import type { QuoteStatus } from '@pkg/schema';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function QuoteStatusChip({ status }: { status: QuoteStatus }) {
  const classNames = quoteStatusColorClassNames[status];

  return (
    <View className={`rounded-full border px-2 py-1 ${classNames.chip}`}>
      <Text className={`text-[10px] tracking-wide ${classNames.text}`} mono weight="semibold">
        {quoteStatusLabels[status]}
      </Text>
    </View>
  );
}
