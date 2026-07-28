import type { ProductUnitBuildState, ProductUnitOwner } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';

/**
 * A Unit nobody owns is Stock — we hold it. That is a derived state of the Unit, not a customer, so it
 * reads as its own chip rather than an empty cell or a placeholder company name.
 */
export const ProductUnitOwnerCell: React.FC<{ owner: ProductUnitOwner | null }> = ({ owner }) => {
  if (!owner) {
    return (
      <Badge className="border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200" variant="outline">
        Stock
      </Badge>
    );
  }

  return <span className="min-w-0 truncate">{owner.companyName}</span>;
};

export const buildStateLabels: Record<ProductUnitBuildState, string> = {
  'in-build': 'In build',
  'on-hand': 'On hand',
};

export const ProductUnitBuildStateCell: React.FC<{ buildState: ProductUnitBuildState }> = ({ buildState }) => (
  <Badge
    className={
      buildState === 'on-hand'
        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
        : 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200'
    }
    variant="outline"
  >
    {buildStateLabels[buildState]}
  </Badge>
);
