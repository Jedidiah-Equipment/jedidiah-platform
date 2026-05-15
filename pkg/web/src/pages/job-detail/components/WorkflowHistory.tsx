import { jobLifecycleStatusLabels, jobStageStatusLabels } from '@pkg/domain';
import type { JobEvent } from '@pkg/schema';
import { HistoryIcon } from 'lucide-react';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { formatDate } from '@/utils/date.js';
import { stageLabels } from '../constants.js';

type WorkflowHistoryProps = {
  events: JobEvent[];
};

export const WorkflowHistory: React.FC<WorkflowHistoryProps> = ({ events }) => (
  <section className="flex flex-col gap-3">
    <div className="flex items-center gap-2">
      <HistoryIcon className="size-4 text-muted-foreground" />
      <h2 className="font-medium">Workflow history</h2>
    </div>
    {events.length > 0 ? (
      <ol className="relative flex flex-col gap-3 border-l pl-4">
        {events.map((event) => (
          <WorkflowHistoryItem event={event} key={event.id} />
        ))}
      </ol>
    ) : (
      <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">No workflow events yet.</div>
    )}
  </section>
);

const WorkflowHistoryItem: React.FC<{ event: JobEvent }> = ({ event }) => (
  <li className="relative flex flex-col gap-1 rounded-md border bg-background p-3 text-sm">
    <span className="left-[-1.35rem] absolute top-4 size-2 rounded-full bg-primary" />
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="font-medium">{getWorkflowEventLabel(event)}</div>
        <div className="text-muted-foreground">{getWorkflowEventMetadata(event)}</div>
      </div>
      <Badge variant="outline">{formatDate(event.occurredAt, 'medium')}</Badge>
    </div>
    <div className="text-xs text-muted-foreground">Actor: {event.actorUserId ?? 'Unknown'}</div>
  </li>
);

function getWorkflowEventLabel(event: JobEvent): string {
  if (event.eventType === 'stage.started') {
    return `${stageLabels[event.payload.stage]} started`;
  }

  if (event.eventType === 'stage.completed') {
    return `${stageLabels[event.payload.stage]} completed`;
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

  if (event.eventType === 'job.completed') {
    return 'Job completed';
  }

  return `${stageLabels[event.payload.stage]} status changed`;
}

function getWorkflowEventMetadata(event: JobEvent): string {
  if (event.eventType === 'stage.started') {
    return `Started at ${formatDate(event.payload.startedAt, 'medium')}`;
  }

  if (event.eventType === 'stage.completed') {
    return `Completed at ${formatDate(event.payload.completedAt, 'medium')}`;
  }

  if (
    event.eventType === 'job.paused' ||
    event.eventType === 'job.resumed' ||
    event.eventType === 'job.cancelled' ||
    event.eventType === 'job.completed'
  ) {
    return `${jobLifecycleStatusLabels[event.payload.fromLifecycleStatus]} to ${
      jobLifecycleStatusLabels[event.payload.toLifecycleStatus]
    }`;
  }

  return `${jobStageStatusLabels[event.payload.fromStatus]} to ${jobStageStatusLabels[event.payload.toStatus]}`;
}
