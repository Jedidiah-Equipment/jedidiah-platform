import type { QuoteStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  accepted: 'Accepted',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
};

const quoteStatusVariants: Record<QuoteStatus, React.ComponentProps<typeof Badge>['variant']> = {
  accepted: 'default',
  draft: 'secondary',
  rejected: 'destructive',
  sent: 'outline',
};

export const QuoteStatusBadge: React.FC<{ status: QuoteStatus }> = ({ status }) => (
  <Badge variant={quoteStatusVariants[status]}>{quoteStatusLabels[status]}</Badge>
);
