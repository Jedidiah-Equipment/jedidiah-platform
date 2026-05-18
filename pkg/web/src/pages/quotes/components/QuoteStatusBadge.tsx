import type { QuoteStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  accepted: 'Accepted',
  draft: 'Draft',
  rejected: 'Rejected',
  sent: 'Sent',
};

const quoteStatusColorClassNames: Record<QuoteStatus, string> = {
  accepted: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  draft: 'border-gray-400/50 bg-gray-500/10 text-gray-700 dark:text-gray-200',
  rejected: 'border-red-500/50 bg-red-500/15 text-red-800 dark:text-red-200',
  sent: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
};

type QuoteStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  status: QuoteStatus;
};

export const QuoteStatusBadge: React.FC<QuoteStatusBadgeProps> = ({ className, status, ...props }) => (
  <Badge className={cn(quoteStatusColorClassNames[status], className)} variant="outline" {...props}>
    {quoteStatusLabels[status]}
  </Badge>
);
