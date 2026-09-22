import { quoteOfferingType, quoteOfferingTypeColorClassNames, quoteOfferingTypeLabels } from '@pkg/domain/equipment';
import type { QuoteKind } from '@pkg/schema/equipment';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type QuoteKindBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  isPartsSale: boolean;
  kind: QuoteKind;
};

export const QuoteKindBadge: React.FC<QuoteKindBadgeProps> = ({ className, isPartsSale, kind, ...props }) => {
  const offeringType = quoteOfferingType({ isPartsSale, kind });
  const colors = quoteOfferingTypeColorClassNames[offeringType];

  return (
    <Badge className={cn(colors.chip, colors.text, className)} variant="outline" {...props}>
      {quoteOfferingTypeLabels[offeringType]}
    </Badge>
  );
};
