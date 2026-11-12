import { quoteStageColorClassNames, quoteStageLabels } from '@pkg/domain/equipment';
import type { QuoteStage } from '@pkg/schema/equipment';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type QuoteStageBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  stage: QuoteStage;
};

export const QuoteStageBadge: React.FC<QuoteStageBadgeProps> = ({ className, stage, ...props }) => (
  <Badge
    className={cn(quoteStageColorClassNames[stage].chip, quoteStageColorClassNames[stage].text, className)}
    variant="outline"
    {...props}
  >
    {quoteStageLabels[stage]}
  </Badge>
);
