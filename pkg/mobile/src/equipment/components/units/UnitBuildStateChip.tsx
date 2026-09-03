import { productUnitBuildStateColorClassNames, productUnitBuildStateLabels, toDisplayBuildState } from '@pkg/domain';
import type { ProductUnitBuildState, ProductUnitOwner } from '@pkg/schema';

import { StatusBadge } from '@/components/ui/status-badge';

export function UnitBuildStateChip({
  buildState,
  owner,
}: {
  buildState: ProductUnitBuildState;
  owner: ProductUnitOwner | null;
}) {
  const displayState = toDisplayBuildState(buildState, owner);
  const classNames = productUnitBuildStateColorClassNames[displayState];

  return <StatusBadge classNames={classNames} label={productUnitBuildStateLabels[displayState]} />;
}
