import { departmentShortLabels } from '@pkg/domain';
import type { JobStageSummary } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';
import { stageLabels } from '@/pages/job-detail/constants.js';
import { getJobStageStatusColorClassNames } from './job-stage-status-color.js';

type JobStageChipsProps = {
  stages: JobStageSummary[];
};

export const JobStageChips: React.FC<JobStageChipsProps> = ({ stages }) => (
  <div className="flex min-w-48 flex-wrap gap-1">
    {stages.map((stage) => {
      const color = getJobStageStatusColorClassNames(stage.stage, stage.state);

      return (
        <Badge
          aria-label={stageLabels[stage.stage]}
          className={cn('w-14 justify-center focus-visible:ring-[3px] focus-visible:ring-ring/50', color.badge)}
          key={stage.id}
          tabIndex={0}
          variant="outline"
        >
          {departmentShortLabels[stage.department]}
        </Badge>
      );
    })}
  </div>
);
