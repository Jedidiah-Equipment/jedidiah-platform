import type { FeedbackStatus } from '@pkg/schema';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

/** Mobile mirror of web's shared FeedbackStatusBadge: one look for a feedback item's status. */
export const feedbackStatusLabels = {
  closed: 'Closed',
  open: 'Open',
  resolved: 'Resolved',
} as const satisfies Record<FeedbackStatus, string>;

const feedbackStatusBadgeClassNames = {
  closed: { chip: 'border-gray-400/50 bg-gray-500/10', text: 'text-gray-700 dark:text-gray-200' },
  open: { chip: 'border-amber-500/50 bg-amber-500/15', text: 'text-amber-800 dark:text-amber-200' },
  resolved: { chip: 'border-emerald-500/50 bg-emerald-500/15', text: 'text-emerald-800 dark:text-emerald-200' },
} as const satisfies Record<FeedbackStatus, { chip: string; text: string }>;

export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  const classNames = feedbackStatusBadgeClassNames[status];

  return (
    <View className={`rounded-full border px-2 py-0.5 ${classNames.chip}`}>
      <Text className={`text-[10px] tracking-wide ${classNames.text}`} weight="semibold">
        {feedbackStatusLabels[status]}
      </Text>
    </View>
  );
}
