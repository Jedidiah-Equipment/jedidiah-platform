import { quoteProductSourceColorClassNames, quoteProductSourceLabels } from '@pkg/domain/equipment';
import type { QuoteProductSource } from '@pkg/schema/equipment';

import { StatusBadge } from '@/components/ui/status-badge';

export function QuoteProductSourceChip({ productSource }: { productSource: QuoteProductSource }) {
  const classNames = quoteProductSourceColorClassNames[productSource];

  return <StatusBadge classNames={classNames} label={quoteProductSourceLabels[productSource]} />;
}
