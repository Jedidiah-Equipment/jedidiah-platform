import type { ProductUnitOwner } from '@pkg/schema/equipment';
import type React from 'react';

import { StockBadge } from '@/equipment/components/common/StockBadge.js';

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
