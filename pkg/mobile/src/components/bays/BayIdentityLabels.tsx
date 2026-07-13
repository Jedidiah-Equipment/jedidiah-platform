import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function BayIdentityLabels({ bayName, operatorName }: { bayName: string; operatorName: string | null }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="text-base leading-5 text-surface-foreground" numberOfLines={1} weight="bold">
        {operatorName ?? 'No operator'}
      </Text>
      <Text className="mt-0.5 text-xs text-muted-foreground" numberOfLines={1}>
        {bayName}
      </Text>
    </View>
  );
}
