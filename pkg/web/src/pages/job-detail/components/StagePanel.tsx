import { jobStageStatusLabels } from '@pkg/domain';
import type { JobDateEditInput, JobStageRollup, StationBooking, UUID } from '@pkg/schema';
import { CheckCircleIcon, PlayIcon, SquareIcon } from 'lucide-react';
import type React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { JobStageStatusBadge } from '../../jobs/components/JobStageStatusBadge.js';
import { stageLabels } from '../constants.js';
import type { JobStageTransitionInput } from '../types.js';
import { EditableDateValue } from './EditableDateValue.js';

type StagePanelProps = {
  canEditDates: boolean;
  isPending: boolean;
  jobId: UUID;
  onComplete: (input: JobStageTransitionInput) => void;
  onEditDate: (input: JobDateEditInput) => void;
  onStart: (input: JobStageTransitionInput) => void;
  onStartStationBooking: (input: { id: UUID }) => void;
  onStopStationBooking: (input: { id: UUID }) => void;
  stage: JobStageRollup;
};
type DateEditableRecord = Pick<
  JobStageRollup | StationBooking,
  | 'actualEnd'
  | 'actualEndSetManually'
  | 'actualStart'
  | 'actualStartSetManually'
  | 'dueEnd'
  | 'dueEndSetManually'
  | 'dueStart'
  | 'dueStartSetManually'
  | 'id'
>;
type DateFieldRowConfig = {
  emptyValue: string;
  field: JobDateEditInput['field'];
  label: string;
  setManuallyKey: keyof Pick<
    DateEditableRecord,
    'actualEndSetManually' | 'actualStartSetManually' | 'dueEndSetManually' | 'dueStartSetManually'
  >;
  valueKey: keyof Pick<DateEditableRecord, 'actualEnd' | 'actualStart' | 'dueEnd' | 'dueStart'>;
};

const dateFieldRows = [
  {
    emptyValue: 'No date',
    field: 'due_start',
    label: 'Due start',
    setManuallyKey: 'dueStartSetManually',
    valueKey: 'dueStart',
  },
  {
    emptyValue: 'No date',
    field: 'due_end',
    label: 'Due end',
    setManuallyKey: 'dueEndSetManually',
    valueKey: 'dueEnd',
  },
  {
    emptyValue: 'Not started',
    field: 'actual_start',
    label: 'Started',
    setManuallyKey: 'actualStartSetManually',
    valueKey: 'actualStart',
  },
  {
    emptyValue: 'Not completed',
    field: 'actual_end',
    label: 'Completed',
    setManuallyKey: 'actualEndSetManually',
    valueKey: 'actualEnd',
  },
] as const satisfies readonly DateFieldRowConfig[];

export const StagePanel: React.FC<StagePanelProps> = ({
  canEditDates,
  isPending,
  jobId,
  onComplete,
  onEditDate,
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
  const showStationBookings = isStageEditable && stage.stations.length > 0;
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
          <DateFieldRows
            canEdit={canEditDates}
            disabled={isPending}
            entityLabel={departmentLabel}
            entityLevel="stage"
            onEdit={onEditDate}
            record={stage}
          />
        </div>
        {showStationBookings ? (
          <div className="flex flex-col gap-2">
            {stage.stations.map((booking) => (
              <StationBookingControl
                booking={booking}
                disabled={!isStageEditable || isPending}
                key={booking.id}
                canEditDates={canEditDates}
                onEditDate={onEditDate}
                onStart={onStartStationBooking}
                onStop={onStopStationBooking}
              />
            ))}
          </div>
        ) : null}
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
          {isStageEditable ? (
            <StageControlReason reason={startAvailability?.reason ?? stopAvailability?.reason} />
          ) : null}
        </div>
      </div>
    </div>
  );
};

const StageControlReason: React.FC<{ reason: string | null | undefined }> = ({ reason }) =>
  reason ? <div className="text-xs text-muted-foreground">{reason}</div> : null;

const StationBookingControl: React.FC<{
  booking: StationBooking;
  canEditDates: boolean;
  disabled: boolean;
  onEditDate: (input: JobDateEditInput) => void;
  onStart: (input: { id: UUID }) => void;
  onStop: (input: { id: UUID }) => void;
}> = ({ booking, canEditDates, disabled, onEditDate, onStart, onStop }) => {
  const canStart = booking.state === 'pending';
  const canStop = booking.state === 'in-progress';
  const buttonDisabled = disabled || booking.state === 'complete';

  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{booking.station.name}</div>
          <div className="text-xs text-muted-foreground">{jobStageStatusLabels[booking.state]}</div>
          <DateFieldRows
            canEdit={canEditDates}
            className="mt-2 grid gap-1 text-xs text-muted-foreground"
            disabled={disabled}
            entityLabel={booking.station.name}
            entityLevel="station-booking"
            onEdit={onEditDate}
            record={booking}
          />
        </div>
        {booking.state === 'complete' ? (
          <div className="shrink-0 text-right text-xs text-muted-foreground">
            <div className="font-medium text-foreground">Completed</div>
            <DateDisplay date={booking.actualEnd} format="medium" />
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

const DateFieldRows: React.FC<{
  canEdit: boolean;
  className?: string;
  disabled: boolean;
  entityLabel: string;
  entityLevel: JobDateEditInput['entityLevel'];
  onEdit: (input: JobDateEditInput) => void;
  record: DateEditableRecord;
}> = ({ canEdit, className = 'contents', disabled, entityLabel, entityLevel, onEdit, record }) => (
  <div className={className}>
    {dateFieldRows.map((dateField) => (
      <div key={dateField.field}>
        {dateField.label}:{' '}
        <EditableDateValue
          canEdit={canEdit}
          disabled={disabled}
          emptyValue={dateField.emptyValue}
          entityId={record.id}
          entityLevel={entityLevel}
          field={dateField.field}
          label={`${entityLabel} ${dateField.label.toLowerCase()}`}
          onEdit={onEdit}
          setManually={record[dateField.setManuallyKey]}
          value={record[dateField.valueKey]}
        />
      </div>
    ))}
  </div>
);
