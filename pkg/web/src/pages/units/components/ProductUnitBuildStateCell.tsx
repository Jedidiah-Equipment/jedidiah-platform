import { productUnitBuildStateLabels, toDisplayBuildState } from '@pkg/domain';
import type { ProductUnitBuildState, ProductUnitDisplayBuildState, ProductUnitOwner } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';

const buildStateBadgeClasses: Record<ProductUnitDisplayBuildState, string> = {
  complete: 'border-slate-500/50 bg-slate-500/15 text-slate-800 dark:text-slate-200',
  'in-build': 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
  'on-hand': 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
};

export const ProductUnitBuildStateCell: React.FC<{
  buildState: ProductUnitBuildState;
  owner: ProductUnitOwner | null;
}> = ({ buildState, owner }) => {
  const displayState = toDisplayBuildState(buildState, owner);

  return (
    <Badge className={buildStateBadgeClasses[displayState]} variant="outline">
      {productUnitBuildStateLabels[displayState]}
    </Badge>
  );
};
