import { productUnitBuildStateColorClassNames, productUnitBuildStateLabels, toDisplayBuildState } from '@pkg/domain';
import type { ProductUnitBuildState, ProductUnitOwner } from '@pkg/schema';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

export function UnitBuildStateChip({
  buildState,
  owner,
}: {
  buildState: ProductUnitBuildState;
  owner: ProductUnitOwner | null;
}) {
  const displayState = toDisplayBuildState(buildState, owner);
  const classNames = productUnitBuildStateColorClassNames[displayState];

  return (
    <View className={`rounded-full border px-2 py-1 ${classNames.chip}`}>
      <Text className={`text-[10px] tracking-wide ${classNames.text}`} mono weight="semibold">
        {productUnitBuildStateLabels[displayState]}
      </Text>
    </View>
  );
}
