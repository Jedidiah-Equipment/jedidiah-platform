import { jobStageStatusLabels } from '@pkg/domain';
import {
  JOB_STAGE_STATUSES,
  type JobStageName,
  type JobStageRollup,
  type JobStageStatus,
  JobStageStatusInput,
  type UUID,
} from '@pkg/schema';
import { CheckCircleIcon, CircleIcon, LockIcon, PlayIcon } from 'lucide-react';
import React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from '@/components/ui/select.js';
import { cn } from '@/lib/utils.js';
import { formatDate } from '@/utils/date.js';
import { JobStageStatusBadge } from '../../jobs/components/JobStageStatusBadge.js';
import { getJobStageStatusColorClassNames } from '../../jobs/components/job-stage-status-color.js';
import { stageLabels } from '../constants.js';
import type { JobStageTransitionInput } from '../types.js';

type StagePanelProps = {
  isPending: boolean;
  jobId: UUID;
  onComplete: (input: JobStageTransitionInput) => void;
  onSetCompleteStatus: (input: JobStageStatusInput) => void;
  onSetStatus: (input: JobStageStatusInput) => void;
  onStart: (input: JobStageTransitionInput) => void;
  stage: JobStageRollup;
};

export const StagePanel: React.FC<StagePanelProps> = ({
  isPending,
  jobId,
  onComplete,
  onSetCompleteStatus,
  onSetStatus,
  onStart,
  stage,
}) => {
  const [status, setStatus] = React.useState<JobStageStatus>(stage.access === 'visible' ? stage.status : 'pending');
  const startAvailability = stage.access === 'visible' ? stage.transitionAvailability?.start : undefined;
  const statusAvailability = stage.access === 'visible' ? stage.transitionAvailability?.['set-status'] : undefined;
  const completeAvailability = stage.access === 'visible' ? stage.transitionAvailability?.complete : undefined;
  const hasStageStarted = stage.access === 'visible' && Boolean(stage.startedAt);
  const isActiveStage = hasStageStarted && !stage.completedAt;
  const isStartDisabled = isPending || !startAvailability?.allowed;
  const isStatusDisabled = isPending || !hasStageStarted || !statusAvailability?.allowed;
  const isCompleteDisabled = isPending || !completeAvailability?.allowed;

  React.useEffect(() => {
    if (stage.access === 'visible') {
      setStatus(stage.status);
    }
  }, [stage]);

  return (
    <div
      className={cn(
        'min-h-36 rounded-md border bg-background p-3',
        isActiveStage &&
          'border-emerald-500/70 bg-emerald-50 shadow-[0_0_0_1px_rgba(16,185,129,0.25)] dark:bg-emerald-500/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div
            className={cn(
              'text-xs font-medium uppercase text-muted-foreground',
              isActiveStage && 'text-emerald-700 dark:text-emerald-300',
            )}
          >
            Stage {stage.sequence}
          </div>
          <div className="font-medium">{stageLabels[stage.stage]}</div>
        </div>
        {stage.access === 'locked' ? (
          <Badge variant="outline">
            <LockIcon data-icon="inline-start" />
            Locked
          </Badge>
        ) : (
          <JobStageStatusBadge stage={stage.stage} status={stage.status} />
        )}
      </div>
      {stage.access === 'visible' ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <div>Started: {formatDate(stage.startedAt, 'short', 'Not started')}</div>
            <div>Completed: {formatDate(stage.completedAt, 'short', 'Not completed')}</div>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              disabled={isStartDisabled}
              onClick={() => onStart({ id: jobId, stage: stage.stage })}
              size="sm"
              type="button"
              variant="outline"
            >
              <PlayIcon data-icon="inline-start" />
              Start
            </Button>
            <div className="flex gap-2">
              <Select
                disabled={isStatusDisabled}
                onValueChange={(value) => {
                  if (!value || value === status) return;

                  const nextStatus = value as JobStageStatus;
                  const input = JobStageStatusInput.parse({ id: jobId, stage: stage.stage, status: nextStatus });
                  if (nextStatus === 'complete' && !stage.completedAt) {
                    onSetCompleteStatus(input);
                    return;
                  }

                  setStatus(nextStatus);
                  onSetStatus(input);
                }}
                value={status}
              >
                <SelectTrigger aria-label={`${stageLabels[stage.stage]} status`} className="min-w-0 flex-1">
                  <JobStageStatusSelectValue stage={stage.stage} status={status} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {JOB_STAGE_STATUSES[stage.stage].map((option) => (
                      <SelectItem
                        key={option}
                        leading={<JobStageStatusIcon stage={stage.stage} status={option} />}
                        value={option}
                      >
                        {jobStageStatusLabels[option]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={isCompleteDisabled}
              onClick={() => onComplete({ id: jobId, stage: stage.stage })}
              size="sm"
              type="button"
              variant="outline"
            >
              <CheckCircleIcon data-icon="inline-start" />
              Complete
            </Button>
            <StageControlReason
              reason={startAvailability?.reason ?? statusAvailability?.reason ?? completeAvailability?.reason}
            />
          </div>
        </div>
      ) : (
        <div className="mt-4 text-sm text-muted-foreground">Stage details hidden.</div>
      )}
    </div>
  );
};

const StageControlReason: React.FC<{ reason: string | null | undefined }> = ({ reason }) =>
  reason ? <div className="text-xs text-muted-foreground">{reason}</div> : null;

const JobStageStatusSelectValue: React.FC<{ stage: JobStageName; status: JobStageStatus }> = ({ stage, status }) => (
  <span className="flex min-w-0 flex-1 items-center gap-2 text-left" data-slot="select-value">
    <JobStageStatusIcon stage={stage} status={status} />
    <span className="truncate">{jobStageStatusLabels[status]}</span>
  </span>
);

const JobStageStatusIcon: React.FC<{ stage: JobStageName; status: JobStageStatus }> = ({ stage, status }) => {
  const color = getJobStageStatusColorClassNames(stage, status);

  return (
    <span className="inline-flex size-3 shrink-0 items-center justify-center">
      <CircleIcon aria-hidden="true" className={cn('size-3', color.icon)} strokeWidth={0} />
    </span>
  );
};
