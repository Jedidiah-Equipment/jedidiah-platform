import { quoteProductSourceColorClassNames, quoteProductSourceLabels } from '@pkg/domain';
import type { QuoteProductSource } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type QuoteProductSourceBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  productSource: QuoteProductSource;
};

export const QuoteProductSourceBadge: React.FC<QuoteProductSourceBadgeProps> = ({
  className,
  productSource,
  ...props
}) => (
  <Badge
    className={cn(
      quoteProductSourceColorClassNames[productSource].chip,
      quoteProductSourceColorClassNames[productSource].text,
      className,
    )}
    variant="outline"
    {...props}
  >
    {quoteProductSourceLabels[productSource]}
  </Badge>
);
