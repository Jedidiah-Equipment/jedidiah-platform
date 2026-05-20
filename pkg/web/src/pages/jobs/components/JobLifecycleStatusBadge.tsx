import { jobLifecycleStatusLabels } from '@pkg/domain';
import type { JobLifecycleStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type JobLifecycleStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  status: JobLifecycleStatus;
};

type JobLifecycleStatusColorClassNames = {
  badge: string;
  icon: string;
};

const jobLifecycleStatusColorClassNames = {
  complete: {
    badge: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    icon: 'fill-emerald-500 text-emerald-500',
  },
  cancelled: {
    badge: 'border-red-500/50 bg-red-500/15 text-red-800 dark:text-red-200',
    icon: 'fill-red-500 text-red-500',
  },
  active: {
    badge: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
    icon: 'fill-blue-500 text-blue-500',
  },
  paused: {
    badge: 'border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200',
    icon: 'fill-orange-500 text-orange-500',
  },
} as const satisfies Record<JobLifecycleStatus, JobLifecycleStatusColorClassNames>;

export function getJobLifecycleStatusColorClassNames(status: JobLifecycleStatus): JobLifecycleStatusColorClassNames {
  return jobLifecycleStatusColorClassNames[status];
}

export function JobLifecycleStatusBadge({ className, status, ...props }: JobLifecycleStatusBadgeProps) {
  const color = getJobLifecycleStatusColorClassNames(status);

  return (
    <Badge className={cn(color.badge, className)} variant="outline" {...props}>
      {jobLifecycleStatusLabels[status]}
    </Badge>
  );
}
