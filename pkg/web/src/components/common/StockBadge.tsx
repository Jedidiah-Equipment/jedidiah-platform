import type React from 'react';

import { Badge } from '@/components/ui/badge.js';

/**
 * Shown wherever a Customer would be, for a Product Unit nobody owns. Stock is a derived state of the
 * machine — we hold it — not a Customer record, so it reads as its own chip rather than an empty cell
 * or a placeholder company name.
 */
export const StockBadge: React.FC = () => (
  <Badge className="border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200" variant="outline">
    Stock
  </Badge>
);
