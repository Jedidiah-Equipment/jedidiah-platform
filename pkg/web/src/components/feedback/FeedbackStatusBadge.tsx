import type { FeedbackStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { cn } from '@/lib/utils.js';

export const feedbackStatusLabels = {
  closed: 'Closed',
  open: 'Open',
  resolved: 'Resolved',
} as const satisfies Record<FeedbackStatus, string>;

export const feedbackStatusBadgeClassNames = {
  closed: 'border-gray-400/50 bg-gray-500/10 text-gray-700 dark:text-gray-200',
  open: 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200',
  resolved: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
} as const satisfies Record<FeedbackStatus, string>;

const statusOptions = Object.entries(feedbackStatusLabels).map(([value, label]) => ({
  label,
  value: value as FeedbackStatus,
}));

export const FeedbackStatusBadge: React.FC<{ status: FeedbackStatus }> = ({ status }) => (
  <Badge className={feedbackStatusBadgeClassNames[status]} variant="outline">
    {feedbackStatusLabels[status]}
  </Badge>
);

/** Badge-styled status picker for surfaces where the caller may move a feedback item's status. */
export const FeedbackStatusSelect: React.FC<{
  className?: string;
  disabled?: boolean;
  onValueChange: (status: FeedbackStatus) => void;
  value: FeedbackStatus;
}> = ({ className, disabled, onValueChange, value }) => (
  <Select disabled={disabled} value={value} onValueChange={(status) => onValueChange(status as FeedbackStatus)}>
    <SelectTrigger
      aria-label="Feedback status"
      className={cn(
        'h-6 min-w-24 justify-center gap-2 px-2 text-xs [&_svg]:text-current',
        feedbackStatusBadgeClassNames[value],
        className,
      )}
      size="sm"
    >
      <SelectValue>{feedbackStatusLabels[value]}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectGroup>
        {statusOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectGroup>
    </SelectContent>
  </Select>
);
