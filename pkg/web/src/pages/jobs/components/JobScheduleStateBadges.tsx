import type { JobScheduleState } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

import { scheduleBadgeToneClass } from './schedule-state-tone.js';

/** Work-Slot lifecycle buckets rendered as count pills, in production-route order. Colors come from
 * the shared planning palette so the badges match the Gantt: done = neutral, active = blue,
 * scheduled = green. */
const scheduleStateBadges: { key: 'done' | 'active' | 'scheduled'; label: string; className: string }[] = [
  { key: 'done', label: 'Done', className: scheduleBadgeToneClass.done },
  { key: 'active', label: 'Active', className: scheduleBadgeToneClass.active },
  { key: 'scheduled', label: 'Scheduled', className: scheduleBadgeToneClass.scheduled },
];

type JobScheduleStateBadgesProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  /** `null` when the caller did not request schedule state (or it is still loading) — renders nothing. */
  scheduleState: JobScheduleState | null;
};

/**
 * Renders a Job's schedule state as colored count pills, one per non-zero lifecycle bucket. A Job
 * with no Work Slots (`total === 0`) shows a single "Not scheduled" warning badge instead — it has
 * dropped off the planning board. Shared by the Job List table (#664) and the quotes hover card (#665).
 */
export const JobScheduleStateBadges: React.FC<JobScheduleStateBadgesProps> = ({
  className,
  scheduleState,
  ...props
}) => {
  if (!scheduleState) return null;

  if (scheduleState.total === 0) {
    return (
      <Badge
        className={cn('border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200', className)}
        variant="outline"
        {...props}
      >
        Not scheduled
      </Badge>
    );
  }

  return (
    <>
      {scheduleStateBadges
        .filter(({ key }) => scheduleState[key] > 0)
        .map(({ key, label, className: colorClassName }) => (
          <Badge key={key} className={cn(colorClassName, className)} variant="outline" {...props}>
            {scheduleState[key]} {label}
          </Badge>
        ))}
    </>
  );
};
