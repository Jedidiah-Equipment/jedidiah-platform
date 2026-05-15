import { jobStageStatusLabels } from '@pkg/domain';
import type { JobStageName, JobStageStatus } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';
import { getJobStageStatusColorClassNames } from './job-stage-status-color.js';

type JobStageStatusBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  stage: JobStageName;
  status: JobStageStatus;
};

export function JobStageStatusBadge({ className, stage, status, ...props }: JobStageStatusBadgeProps) {
  const color = getJobStageStatusColorClassNames(stage, status);

  return (
    <Badge className={cn(color.badge, className)} variant="outline" {...props}>
      {jobStageStatusLabels[status]}
    </Badge>
  );
}
