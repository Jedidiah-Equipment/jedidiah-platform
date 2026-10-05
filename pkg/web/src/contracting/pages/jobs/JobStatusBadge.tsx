import {
  jobQueueColorClassNames,
  jobQueueLabels,
  jobStatusColorClassNames,
  jobStatusLabels,
} from '@pkg/domain/contracting';
import type { JobQueue, JobStatus } from '@pkg/schema/contracting';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type JobStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  status: JobStatus;
};

export const JobStatusBadge: React.FC<JobStatusBadgeProps> = ({ className, status, ...props }) => (
  <Badge
    className={cn(jobStatusColorClassNames[status].chip, jobStatusColorClassNames[status].text, className)}
    variant="outline"
    {...props}
  >
    {jobStatusLabels[status]}
  </Badge>
);

/** The workflow stage a Job sits in, which can differ from its stored status. */
export const JobQueueBadge: React.FC<{ queue: JobQueue }> = ({ queue }) => (
  <Badge className={cn(jobQueueColorClassNames[queue].chip, jobQueueColorClassNames[queue].text)} variant="outline">
    {jobQueueLabels[queue]}
  </Badge>
);
