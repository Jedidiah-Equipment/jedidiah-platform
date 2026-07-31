import { productUnitBuildStateLabels, toDisplayBuildState } from '@pkg/domain';
import type { ProductUnitBuildState, ProductUnitDisplayBuildState, ProductUnitOwner } from '@pkg/schema';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

/** Split so the Text element carries its own colour, mirroring the web Build badge palette. */
const buildStateClassNames: Record<ProductUnitDisplayBuildState, { chip: string; text: string }> = {
  complete: { chip: 'border-slate-500/50 bg-slate-500/15', text: 'text-slate-800 dark:text-slate-200' },
  'in-build': { chip: 'border-blue-500/50 bg-blue-500/15', text: 'text-blue-800 dark:text-blue-200' },
  'on-hand': { chip: 'border-emerald-500/50 bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-200' },
};

export function UnitBuildStateChip({
  buildState,
  owner,
}: {
  buildState: ProductUnitBuildState;
  owner: ProductUnitOwner | null;
}) {
  const displayState = toDisplayBuildState(buildState, owner);
  const classNames = buildStateClassNames[displayState];

  return (
    <View className={`rounded-full border px-2 py-1 ${classNames.chip}`}>
      <Text className={`text-[10px] tracking-wide ${classNames.text}`} mono weight="semibold">
        {productUnitBuildStateLabels[displayState]}
      </Text>
    </View>
  );
}
