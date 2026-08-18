import type { FeedbackStatus } from '@pkg/schema';

import { statusBadgeColorClassNames } from '../theme/status-badge.js';

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  closed: 'Closed',
  open: 'Open',
  resolved: 'Resolved',
};

/** Feedback uses the same status palette on web and mobile. */
export const feedbackStatusColorClassNames: Record<FeedbackStatus, { chip: string; text: string }> = {
  closed: statusBadgeColorClassNames.gray,
  open: statusBadgeColorClassNames.yellow,
  resolved: statusBadgeColorClassNames.green,
};
