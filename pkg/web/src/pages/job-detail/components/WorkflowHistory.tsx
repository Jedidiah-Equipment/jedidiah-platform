import { jobLifecycleStatusLabels } from '@pkg/domain';
import type { JobEvent } from '@pkg/schema';
import { ClockIcon, HistoryIcon, UserCircleIcon } from 'lucide-react';
import type React from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { DepartmentIcon } from '@/components/departments/index.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { cn } from '@/lib/utils.js';
import { stageLabels } from '../constants.js';
import { getStageStartedMetadata, getStageStatusChangeCopy } from './workflow-history-copy.js';

type WorkflowHistoryProps = {
  events: JobEvent[];
};

export const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ events }) => (
  <section className="grid h-[calc(100vh-7rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-md border bg-muted/10 p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <HistoryIcon className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="truncate font-medium">Workflow history</h2>
      </div>
      <span className="shrink-0 rounded-md border bg-background px-2 py-0.5 text-xs text-muted-foreground">
        {events.length}
      </span>
    </div>
    {events.length > 0 ? (
      <ScrollArea className="min-h-0 pr-2">
        <ol className="flex flex-col gap-2">
          {events.map((event) => (
            <WorkflowHistoryItem event={event} key={event.id} />
          ))}
        </ol>
      </ScrollArea>
    ) : (
      <div className="rounded-md border bg-background p-3 text-sm text-muted-foreground">No workflow events yet.</div>
    )}
  </section>
);

const WorkflowHistoryItem: React.FC<{ event: JobEvent }> = ({ event }) => (
  <li className="grid grid-cols-[0.75rem_minmax(0,1fr)] gap-3 rounded-md border bg-background p-3 text-sm">
    <span className={cn('mt-1.5 size-2.5 rounded-full ring-4 ring-background', getWorkflowEventColor(event))} />
    <div className="flex min-w-0 flex-col gap-2">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          {getWorkflowEventStageIcon(event)}
          <span className="truncate">{getWorkflowEventLabel(event)}</span>
        </div>
        <div className="text-muted-foreground text-xs pt-0.5">{getWorkflowEventMetadata(event)}</div>
      </div>
      <div className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-1.5">
          <ClockIcon className="size-3.5 shrink-0" />
          <DateDisplay className="truncate" date={event.occurredAt} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5">
          <UserCircleIcon className="size-3.5 shrink-0" />
          <span className="truncate">{getWorkflowEventActorLabel(event)}</span>
        </div>
      </div>
    </div>
  </li>
);

function getWorkflowEventStageIcon(event: JobEvent): React.ReactNode {
  if (!isStageWorkflowEvent(event)) {
    return null;
  }

  return <DepartmentIcon className="size-4 shrink-0" department={event.payload.stage} />;
}

function getWorkflowEventLabel(event: JobEvent): string {
  if (event.eventType === 'stage.started') {
    return `${stageLabels[event.payload.stage]} started`;
  }

  if (event.eventType === 'stage.completed') {
    return `${stageLabels[event.payload.stage]} completed`;
  }

  if (event.eventType === 'stage.ended') {
    return `${stageLabels[event.payload.stage]} ended`;
  }

  if (event.eventType === 'stage.stopped') {
    return `${stageLabels[event.payload.stage]} stopped`;
  }

  if (event.eventType === 'station.started') {
    return `${event.payload.stationName} started`;
  }

  if (event.eventType === 'station.ended') {
    return `${event.payload.stationName} ended`;
  }

  if (event.eventType === 'job.started') {
    return 'Job started';
  }

  if (event.eventType === 'job.paused') {
    return 'Job paused';
  }

  if (event.eventType === 'job.resumed') {
    return 'Job resumed';
  }

  if (event.eventType === 'job.cancelled') {
    return 'Job cancelled';
  }

  if (event.eventType === 'job.uncancelled') {
    return 'Job uncancelled';
  }

  if (event.eventType === 'job.completed') {
    return 'Job completed';
  }

  return getStageStatusChangeCopy(event.payload).label;
}

function getWorkflowEventMetadata(event: JobEvent): React.ReactNode {
  if (event.eventType === 'stage.started') {
    return getStageStartedMetadata(event.payload);
  }

  if (event.eventType === 'stage.completed') {
    return (
      <>
        Completed at <DateDisplay date={event.payload.completedAt} format="medium" />
      </>
    );
  }

  if (event.eventType === 'stage.stopped') {
    return (
      <>
        Stopped at <DateDisplay date={event.payload.actualEnd} format="medium" />
      </>
    );
  }

  if (event.eventType === 'stage.ended') {
    return (
      <>
        Ended at <DateDisplay date={event.payload.actualEnd} format="medium" />
      </>
    );
  }

  if (event.eventType === 'station.started') {
    return (
      <>
        {stageLabels[event.payload.stage]} at <DateDisplay date={event.payload.actualStart} format="medium" />
      </>
    );
  }

  if (event.eventType === 'station.ended') {
    return (
      <>
        {stageLabels[event.payload.stage]} at <DateDisplay date={event.payload.actualEnd} format="medium" />
      </>
    );
  }

  if (
    event.eventType === 'job.started' ||
    event.eventType === 'job.paused' ||
    event.eventType === 'job.resumed' ||
    event.eventType === 'job.cancelled' ||
    event.eventType === 'job.uncancelled' ||
    event.eventType === 'job.completed'
  ) {
    return `${jobLifecycleStatusLabels[event.payload.fromLifecycleStatus]} to ${
      jobLifecycleStatusLabels[event.payload.toLifecycleStatus]
    }`;
  }

  return getStageStatusChangeCopy(event.payload).metadata;
}

function getWorkflowEventActorLabel(event: JobEvent): string {
  if (event.actorName) {
    return event.actorName;
  }

  return event.actorUserId ? 'Unknown user' : 'System';
}

function isStageWorkflowEvent(event: JobEvent): event is Extract<
  JobEvent,
  {
    eventType:
      | 'stage.started'
      | 'stage.ended'
      | 'stage.stopped'
      | 'stage.completed'
      | 'stage.status_changed'
      | 'station.started'
      | 'station.ended';
  }
> {
  return (
    event.eventType === 'stage.started' ||
    event.eventType === 'stage.ended' ||
    event.eventType === 'stage.stopped' ||
    event.eventType === 'stage.completed' ||
    event.eventType === 'stage.status_changed' ||
    event.eventType === 'station.started' ||
    event.eventType === 'station.ended'
  );
}

function getWorkflowEventColor(event: JobEvent): string {
  if (
    event.eventType === 'stage.completed' ||
    event.eventType === 'stage.ended' ||
    event.eventType === 'stage.stopped' ||
    event.eventType === 'station.ended' ||
    event.eventType === 'job.completed'
  ) {
    return 'bg-emerald-500';
  }

  if (event.eventType === 'job.paused') {
    return 'bg-amber-500';
  }

  if (event.eventType === 'job.cancelled') {
    return 'bg-destructive';
  }

  if (
    event.eventType === 'job.resumed' ||
    event.eventType === 'job.uncancelled' ||
    event.eventType === 'job.started' ||
    event.eventType === 'stage.started' ||
    event.eventType === 'station.started'
  ) {
    return 'bg-sky-500';
  }

  return 'bg-primary';
}
