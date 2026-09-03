import { quoteStatusColorClassNames, quoteStatusLabels } from '@pkg/domain';
import type { QuoteStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type QuoteStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  status: QuoteStatus;
};

export const QuoteStatusBadge: React.FC<QuoteStatusBadgeProps> = ({ className, status, ...props }) => (
  <Badge
    className={cn(quoteStatusColorClassNames[status].chip, quoteStatusColorClassNames[status].text, className)}
    variant="outline"
    {...props}
  >
    {quoteStatusLabels[status]}
  </Badge>
);
