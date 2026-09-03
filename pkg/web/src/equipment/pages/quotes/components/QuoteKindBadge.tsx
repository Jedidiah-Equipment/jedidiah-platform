import { quoteKindColorClassNames, quoteKindLabels } from '@pkg/domain';
import type { QuoteKind } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type QuoteKindBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  kind: QuoteKind;
};

export const QuoteKindBadge: React.FC<QuoteKindBadgeProps> = ({ className, kind, ...props }) => (
  <Badge
    className={cn(quoteKindColorClassNames[kind].chip, quoteKindColorClassNames[kind].text, className)}
    variant="outline"
    {...props}
  >
    {quoteKindLabels[kind]}
  </Badge>
);
