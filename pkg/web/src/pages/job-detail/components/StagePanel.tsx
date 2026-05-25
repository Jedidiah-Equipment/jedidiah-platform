import { jobStageStatusLabels } from '@pkg/domain';
import type { JobStageRollup } from '@pkg/schema';
import type React from 'react';

import { cn } from '@/lib/utils.js';
import { JobStageStatusBadge } from '../../jobs/components/JobStageStatusBadge.js';
import { stageLabels } from '../constants.js';

type StagePanelProps = {
  isPending: boolean;
  stage: JobStageRollup;
};

export const StagePanel: React.FC<StagePanelProps> = ({ isPending, stage }) => {
  const isStageVisible = stage.access === 'visible';
  const departmentLabel = stageLabels[stage.stage];

  return (
    <div
      className={cn(
        'min-h-36 rounded-md border bg-background p-3',
        isStageVisible && 'border-blue-500/70 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.22)] dark:bg-blue-500/10',
      )}
      aria-busy={isPending}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              'text-xs font-medium uppercase text-muted-foreground',
              isStageVisible && 'text-blue-700 dark:text-blue-300',
            )}
          >
            Department
          </div>
          <div className="font-medium">{departmentLabel}</div>
        </div>
        <JobStageStatusBadge stage={stage.stage} status={stage.state} />
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <div>
            State: <span className="text-foreground">{jobStageStatusLabels[stage.state]}</span>
          </div>
          <div>
            Access: <span className="text-foreground">{stage.access === 'visible' ? 'Visible' : 'Summary'}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
