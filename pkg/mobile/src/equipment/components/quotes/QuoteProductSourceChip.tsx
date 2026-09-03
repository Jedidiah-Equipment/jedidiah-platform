import { quoteProductSourceColorClassNames, quoteProductSourceLabels } from '@pkg/domain';
import type { QuoteProductSource } from '@pkg/schema';

import { StatusBadge } from '@/components/ui/status-badge';

export function QuoteProductSourceChip({ productSource }: { productSource: QuoteProductSource }) {
  const classNames = quoteProductSourceColorClassNames[productSource];

  return <StatusBadge classNames={classNames} label={quoteProductSourceLabels[productSource]} />;
}
