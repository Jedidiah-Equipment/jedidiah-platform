import { jobStatusColorClassNames, jobStatusLabels } from '@pkg/domain/contracting';
import type { JobStatus } from '@pkg/schema/contracting';
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
