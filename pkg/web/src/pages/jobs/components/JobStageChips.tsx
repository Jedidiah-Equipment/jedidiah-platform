import { departmentShortLabels, jobStageStatusLabels } from '@pkg/domain';
import type { JobStageSummary } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
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
      const tooltip = `${stageLabels[stage.stage]} — ${jobStageStatusLabels[stage.state]}`;

      return (
        <Tooltip key={stage.id}>
          <TooltipTrigger
            render={
              <Badge
                aria-label={tooltip}
                className={cn(
                  'min-w-12 justify-center focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  color.badge,
                )}
                tabIndex={0}
                variant="outline"
              >
                {departmentShortLabels[stage.department]}
              </Badge>
            }
          />
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      );
    })}
  </div>
);
