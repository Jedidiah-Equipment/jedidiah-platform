import { quoteStageColorClassNames, quoteStageLabels } from '@pkg/domain/equipment';
import type { QuoteStage } from '@pkg/schema/equipment';

import { StatusBadge } from '@/components/ui/status-badge';

export function QuoteStageChip({ stage }: { stage: QuoteStage }) {
  return <StatusBadge classNames={quoteStageColorClassNames[stage]} label={quoteStageLabels[stage]} />;
}
