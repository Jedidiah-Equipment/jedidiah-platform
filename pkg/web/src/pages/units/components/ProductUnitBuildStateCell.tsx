import { productUnitBuildStateColorClassNames, productUnitBuildStateLabels, toDisplayBuildState } from '@pkg/domain';
import type { ProductUnitBuildState, ProductUnitOwner } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';

export const ProductUnitBuildStateCell: React.FC<{
  buildState: ProductUnitBuildState;
  owner: ProductUnitOwner | null;
}> = ({ buildState, owner }) => {
  const displayState = toDisplayBuildState(buildState, owner);
  const classNames = productUnitBuildStateColorClassNames[displayState];

  return (
    <Badge className={`${classNames.chip} ${classNames.text}`} variant="outline">
      {productUnitBuildStateLabels[displayState]}
    </Badge>
  );
};
