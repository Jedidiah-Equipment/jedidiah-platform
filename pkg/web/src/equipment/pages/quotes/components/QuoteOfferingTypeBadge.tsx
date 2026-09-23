import {
  type QuoteOfferingFacts,
  quoteOfferingType,
  quoteOfferingTypeColorClassNames,
  quoteOfferingTypeLabel,
} from '@pkg/domain/equipment';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type QuoteOfferingTypeBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  quote: QuoteOfferingFacts;
};

export const QuoteOfferingTypeBadge: React.FC<QuoteOfferingTypeBadgeProps> = ({ className, quote, ...props }) => {
  const colors = quoteOfferingTypeColorClassNames[quoteOfferingType(quote)];

  return (
    <Badge className={cn(colors.chip, colors.text, className)} variant="outline" {...props}>
      {quoteOfferingTypeLabel(quote)}
    </Badge>
  );
};
