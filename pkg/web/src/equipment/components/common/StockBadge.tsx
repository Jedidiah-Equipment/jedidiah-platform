import { statusBadgeColorClassNames } from '@pkg/domain';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

/**
 * Shown wherever a Customer would be, for a Product Unit nobody owns. Stock is a derived state of the
 * machine — we hold it — not a Customer record, so it reads as its own chip rather than an empty cell
 * or a placeholder company name.
 */
export const StockBadge: React.FC = () => (
  <Badge
    className={cn(statusBadgeColorClassNames.yellow.chip, statusBadgeColorClassNames.yellow.text)}
    variant="outline"
  >
    Stock
  </Badge>
);
