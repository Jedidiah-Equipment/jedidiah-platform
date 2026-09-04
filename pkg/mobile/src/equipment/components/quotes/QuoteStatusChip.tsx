import { quoteStatusColorClassNames, quoteStatusLabels } from '@pkg/domain/equipment';
import type { QuoteStatus } from '@pkg/schema/equipment';

import { StatusBadge } from '@/components/ui/status-badge';

export function QuoteStatusChip({ status }: { status: QuoteStatus }) {
  const classNames = quoteStatusColorClassNames[status];

  return <StatusBadge classNames={classNames} label={quoteStatusLabels[status]} />;
}
