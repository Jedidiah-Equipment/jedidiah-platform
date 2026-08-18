import { feedbackStatusColorClassNames, feedbackStatusLabels } from '@pkg/domain';
import type { FeedbackStatus } from '@pkg/schema';

import { StatusBadge } from '@/components/ui/status-badge';

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <StatusBadge classNames={feedbackStatusColorClassNames[status]} label={feedbackStatusLabels[status]} />;
}
