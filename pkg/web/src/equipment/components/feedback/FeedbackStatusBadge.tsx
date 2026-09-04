import { feedbackStatusColorClassNames, feedbackStatusLabels } from '@pkg/domain/equipment';
import type { FeedbackStatus } from '@pkg/schema/equipment';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.js';
import { cn } from '@/lib/utils.js';

export { feedbackStatusLabels };

export const feedbackStatusBadgeClassNames = Object.fromEntries(
  Object.entries(feedbackStatusColorClassNames).map(([status, classNames]) => [
    status,
    `${classNames.chip} ${classNames.text}`,
  ]),
) as Record<FeedbackStatus, string>;

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
