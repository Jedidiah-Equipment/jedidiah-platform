import { jobStageStatusLabels } from '@pkg/domain';
import type { JobStageRollup, StationBooking, UUID } from '@pkg/schema';
import { CheckCircleIcon, PlayIcon, SquareIcon } from 'lucide-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { JobStageStatusBadge } from '../../jobs/components/JobStageStatusBadge.js';
import { stageLabels } from '../constants.js';
import type { JobStageTransitionInput } from '../types.js';

type StagePanelProps = {
  isPending: boolean;
  jobId: UUID;
  onComplete: (input: JobStageTransitionInput) => void;
  onStart: (input: JobStageTransitionInput) => void;
  onStartStationBooking: (input: { id: UUID }) => void;
  onStopStationBooking: (input: { id: UUID }) => void;
  stage: JobStageRollup;
};

export const StagePanel: React.FC<StagePanelProps> = ({
  isPending,
  jobId,
  onComplete,
  onStart,
  onStartStationBooking,
  onStopStationBooking,
  stage,
}) => {
  const startAvailability = stage.access === 'visible' ? stage.transitionAvailability?.start : undefined;
  const stopAvailability = stage.access === 'visible' ? stage.transitionAvailability?.stop : undefined;
  const isStageEditable = stage.access === 'visible';
  const hasStageStarted = Boolean(stage.actualStart);
  const isActiveStage = hasStageStarted && !stage.actualEnd;
  const isStartDisabled = isPending || !isStageEditable || !startAvailability?.allowed;
  const isCompleteDisabled = isPending || !isStageEditable || !stopAvailability?.allowed;
  const isPendingStage = stage.state === 'pending' && !hasStageStarted && !stage.actualEnd;
  const canStartPendingStage = isPendingStage && startAvailability?.allowed;
  const isBlockedPendingStage = isPendingStage && !startAvailability?.allowed;
  const showStationBookings = stage.stations.length > 0;
  const departmentLabel = stageLabels[stage.stage];

  return (
    <div
      className={cn(
        'min-h-36 rounded-md border bg-background p-3',
        isActiveStage && 'border-blue-500/70 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.22)] dark:bg-blue-500/10',
        canStartPendingStage &&
          'border-cyan-500/70 bg-cyan-50 shadow-[0_0_0_1px_rgba(6,182,212,0.22)] dark:bg-cyan-500/10',
        isBlockedPendingStage && 'border-gray-400/70 bg-muted/30 dark:bg-gray-500/10',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div
            className={cn(
              'text-xs font-medium uppercase text-muted-foreground',
              isActiveStage && 'text-blue-700 dark:text-blue-300',
              canStartPendingStage && 'text-cyan-700 dark:text-cyan-300',
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
        </div>
        {showStationBookings ? (
          <div className="flex flex-col gap-2">
            {stage.stations.map((booking) => (
              <StationBookingControl
                booking={booking}
                canTransition={isStageEditable}
                disabled={isPending}
                key={booking.id}
                onStart={onStartStationBooking}
                onStop={onStopStationBooking}
              />
            ))}
          </div>
        ) : null}
        {isStageEditable ? (
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
            <StageControlReason reason={startAvailability?.reason ?? stopAvailability?.reason} />
          </div>
        ) : null}
      </div>
    </div>
  );
};

const StageControlReason: React.FC<{ reason: string | null | undefined }> = ({ reason }) =>
  reason ? <div className="text-xs text-muted-foreground">{reason}</div> : null;

const StationBookingControl: React.FC<{
  booking: StationBooking;
  canTransition: boolean;
  disabled: boolean;
  onStart: (input: { id: UUID }) => void;
  onStop: (input: { id: UUID }) => void;
}> = ({ booking, canTransition, disabled, onStart, onStop }) => {
  const canStart = booking.state === 'pending';
  const canStop = booking.state === 'in-progress';
  const buttonDisabled = disabled || booking.state === 'complete';

  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{booking.station.name}</div>
          <div className="text-xs text-muted-foreground">{jobStageStatusLabels[booking.state]}</div>
        </div>
        {!canTransition || booking.state === 'complete' ? (
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div className="font-medium text-foreground">{jobStageStatusLabels[booking.state]}</div>
          </div>
        ) : canStop ? (
          <Button disabled={buttonDisabled} onClick={() => onStop({ id: booking.id })} size="sm" type="button">
            <SquareIcon data-icon="inline-start" />
            Stop
          </Button>
        ) : (
          <Button
            disabled={buttonDisabled || !canStart}
            onClick={() => onStart({ id: booking.id })}
            size="sm"
            type="button"
          >
            <PlayIcon data-icon="inline-start" />
            Start
          </Button>
        )}
      </div>
    </div>
  );
};
