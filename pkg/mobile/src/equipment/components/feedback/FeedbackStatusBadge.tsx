import { feedbackStatusColorClassNames, feedbackStatusLabels } from '@pkg/domain/equipment';
import type { FeedbackStatus } from '@pkg/schema/equipment';

import { StatusBadge } from '@/components/ui/status-badge';

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <StatusBadge classNames={feedbackStatusColorClassNames[status]} label={feedbackStatusLabels[status]} />;
}
