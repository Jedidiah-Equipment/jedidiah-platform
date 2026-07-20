import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function BayIdentityLabels({ bayName, operatorName }: { bayName: string; operatorName: string | null }) {
  const operatorSuffix = operatorName ? ` - ${operatorName}` : null;
  const displayBayName =
    operatorSuffix && bayName.endsWith(operatorSuffix) ? bayName.slice(0, -operatorSuffix.length) : bayName;

  return (
    <View className="min-w-0 flex-1">
      <Text className="text-base leading-5 text-surface-foreground" numberOfLines={1} weight="bold">
        {operatorName ?? 'No operator'}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
        {displayBayName}
      </Text>
    </View>
  );
}
