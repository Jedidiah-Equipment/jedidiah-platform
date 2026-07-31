import type { ProductUnitBuildState, ProductUnitBuildStateFilter, ProductUnitOwner } from '@pkg/schema';
import type React from 'react';

import { StockBadge } from '@/components/common/StockBadge.js';
import { Badge } from '@/components/ui/badge.js';

/**
 * A Unit nobody owns is Stock — we hold it. That is a derived state of the Unit, not a customer, so it
 * reads as its own chip rather than an empty cell or a placeholder company name.
 */
export const ProductUnitOwnerCell: React.FC<{ owner: ProductUnitOwner | null }> = ({ owner }) => {
  if (!owner) {
    return <StockBadge />;
  }

  return <span className="min-w-0 truncate">{owner.companyName}</span>;
};

export const buildStateLabels: Record<ProductUnitBuildStateFilter, string> = {
  complete: 'Complete',
  'in-build': 'In build',
  'on-hand': 'On hand',
};

const buildStateBadgeClasses: Record<ProductUnitBuildStateFilter, string> = {
  complete: 'border-slate-500/50 bg-slate-500/15 text-slate-800 dark:text-slate-200',
  'in-build': 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
  'on-hand': 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
};

/**
 * Complete is On Hand plus an Owner. The machine has no third build state — its build either finished
 * or it did not — so this reads the Owner at display time rather than asking the server to invent one.
 */
export function toDisplayBuildState(
  buildState: ProductUnitBuildState,
  owner: ProductUnitOwner | null,
): ProductUnitBuildStateFilter {
  return buildState === 'on-hand' && owner ? 'complete' : buildState;
}

export const ProductUnitBuildStateCell: React.FC<{
  buildState: ProductUnitBuildState;
  owner: ProductUnitOwner | null;
}> = ({ buildState, owner }) => {
  const displayState = toDisplayBuildState(buildState, owner);

  return (
    <Badge className={buildStateBadgeClasses[displayState]} variant="outline">
      {buildStateLabels[displayState]}
    </Badge>
  );
};
