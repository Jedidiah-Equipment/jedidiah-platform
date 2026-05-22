import { jobStageStatusLabels } from '@pkg/domain';
import type { JobDetail, JobStageRollup, StationBooking } from '@pkg/schema';
import { addDays, isBefore, startOfDay } from 'date-fns';
import { ChevronDownIcon, ChevronRightIcon, CircleIcon, DiamondIcon } from 'lucide-react';
import React from 'react';

import {
  GanttFeatureList,
  GanttHeader,
  GanttProvider,
  GanttTimeline,
  GanttToday,
  getGanttOffset,
  getGanttWidth,
  useGanttContext,
} from '@/components/kibo-ui/gantt/index.js';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import { formatDate, parseDate } from '@/utils/date.js';

import { stageLabels } from '../constants.js';

type ScheduleGanttProps = {
  job: JobDetail;
};

export type ScheduleGanttRow = {
  actualEnd: string | null;
  actualStart: string | null;
  dueEnd: string | null;
  dueStart: string | null;
  id: string;
  level: 'job' | 'stage' | 'station';
  parentId: string | null;
  statusLabel: string;
  title: string;
};

type ScheduleGanttRenderableRow = ScheduleGanttRow & {
  expanded: boolean;
  visible: boolean;
};

const SIDEBAR_WIDTH = 320;
const ROW_HEIGHT = 42;

export const ScheduleGantt: React.FC<ScheduleGanttProps> = ({ job }) => {
  const rows = React.useMemo(() => buildScheduleGanttRows(job), [job]);
  const stageIds = React.useMemo(() => rows.filter((row) => row.level === 'stage').map((row) => row.id), [rows]);
  const [collapsedStageIds, setCollapsedStageIds] = React.useState<Set<string>>(() => new Set());
  const visibleRows = React.useMemo<ScheduleGanttRenderableRow[]>(
    () =>
      rows.map((row) => {
        const isCollapsedChild = row.parentId ? collapsedStageIds.has(row.parentId) : false;

        return {
          ...row,
          expanded: row.level === 'stage' ? !collapsedStageIds.has(row.id) : false,
          visible: !isCollapsedChild,
        };
      }),
    [collapsedStageIds, rows],
  );
  const visibleRowCount = visibleRows.filter((row) => row.visible).length;
  const ganttHeight = Math.max(420, 60 + visibleRowCount * ROW_HEIGHT);

  const toggleStage = (stageId: string) => {
    setCollapsedStageIds((current) => {
      const next = new Set(current);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Schedule</h2>
          <p className="text-sm text-muted-foreground">
            Due ranges and actual progress by Job, Department, and Station.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <LegendItem className="border border-sky-500/70 bg-transparent" label="Due" />
          <LegendItem className="bg-sky-600" label="Actual" />
          <span className="inline-flex items-center gap-1">
            <DiamondIcon data-icon="inline-start" />
            Milestone
          </span>
        </div>
      </div>
      <div style={{ height: ganttHeight }}>
        <GanttProvider className="rounded-md border bg-background" range="daily" zoom={70}>
          <ScheduleGanttSidebar
            collapsedStageIds={collapsedStageIds}
            rows={visibleRows}
            stageIds={stageIds}
            toggleStage={toggleStage}
          />
          <GanttTimeline>
            <GanttHeader />
            <GanttFeatureList className="absolute top-0 left-0 h-full w-max space-y-0">
              <div style={{ paddingTop: 'var(--gantt-header-height)' }}>
                {visibleRows.map((row) => (row.visible ? <ScheduleGanttTimelineRow key={row.id} row={row} /> : null))}
              </div>
              <GanttToday className="bg-primary text-primary-foreground" />
            </GanttFeatureList>
          </GanttTimeline>
        </GanttProvider>
      </div>
    </section>
  );
};

export function buildScheduleGanttRows(job: JobDetail): ScheduleGanttRow[] {
  return [
    createJobRow(job),
    ...job.stages.flatMap((stage) => [
      createStageRow(stage),
      ...stage.stations.map((station) => createStationRow(stage, station)),
    ]),
  ];
}

function createJobRow(job: JobDetail): ScheduleGanttRow {
  return {
    actualEnd: job.actualEnd,
    actualStart: job.actualStart,
    dueEnd: job.dueEnd,
    dueStart: job.dueStart,
    id: `job-${job.id}`,
    level: 'job',
    parentId: null,
    statusLabel: 'Job',
    title: job.code,
  };
}

function createStageRow(stage: JobStageRollup): ScheduleGanttRow {
  return {
    actualEnd: stage.actualEnd,
    actualStart: stage.actualStart,
    dueEnd: stage.dueEnd,
    dueStart: stage.dueStart,
    id: `stage-${stage.id}`,
    level: 'stage',
    parentId: null,
    statusLabel: jobStageStatusLabels[stage.state],
    title: stageLabels[stage.stage],
  };
}

function createStationRow(stage: JobStageRollup, station: StationBooking): ScheduleGanttRow {
  return {
    actualEnd: station.actualEnd,
    actualStart: station.actualStart,
    dueEnd: station.dueEnd,
    dueStart: station.dueStart,
    id: `station-${station.id}`,
    level: 'station',
    parentId: `stage-${stage.id}`,
    statusLabel: jobStageStatusLabels[station.state],
    title: station.station.name,
  };
}

const ScheduleGanttSidebar: React.FC<{
  collapsedStageIds: Set<string>;
  rows: ScheduleGanttRenderableRow[];
  stageIds: string[];
  toggleStage: (stageId: string) => void;
}> = ({ collapsedStageIds, rows, stageIds, toggleStage }) => (
  <div
    className="sticky left-0 z-30 h-max min-h-full overflow-clip border-r bg-background/95 backdrop-blur"
    data-roadmap-ui="gantt-sidebar"
    style={{ width: SIDEBAR_WIDTH }}
  >
    <div
      className="sticky top-0 z-10 flex items-end justify-between border-b bg-background/95 px-3 py-2 text-xs font-medium text-muted-foreground backdrop-blur"
      style={{ height: 'var(--gantt-header-height)' }}
    >
      <span>Schedule row</span>
      <span>Status</span>
    </div>
    {rows.map((row) => {
      if (!row.visible) return null;

      const isStage = stageIds.includes(row.id);
      const isCollapsed = collapsedStageIds.has(row.id);

      return (
        <div
          className={cn(
            'flex items-center gap-2 border-b px-3 text-xs',
            row.level === 'job' && 'bg-muted/50 font-medium',
            row.level === 'station' && 'pl-9',
          )}
          key={row.id}
          style={{ height: ROW_HEIGHT }}
        >
          {isStage ? (
            <Button
              aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${row.title}`}
              className="shrink-0"
              onClick={() => toggleStage(row.id)}
              size="icon"
              type="button"
              variant="ghost"
            >
              {isCollapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
            </Button>
          ) : (
            <span className="flex size-8 shrink-0 items-center justify-center">
              <CircleIcon className={cn('text-muted-foreground', row.level === 'station' && 'size-2 fill-current')} />
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{row.title}</span>
          <span className="shrink-0 text-muted-foreground">{row.statusLabel}</span>
        </div>
      );
    })}
  </div>
);

const ScheduleGanttTimelineRow: React.FC<{ row: ScheduleGanttRow }> = ({ row }) => (
  <div
    className={cn('relative border-b', row.level === 'job' && 'bg-muted/20')}
    style={{ height: ROW_HEIGHT, width: 'calc(var(--gantt-column-width) * 1096)' }}
  >
    <ScheduleGanttDueRange row={row} />
    <ScheduleGanttActualRange row={row} />
  </div>
);

const ScheduleGanttDueRange: React.FC<{ row: ScheduleGanttRow }> = ({ row }) => {
  const start = parseScheduleDate(row.dueStart);
  const end = parseScheduleDate(row.dueEnd);

  if (!start && !end) return null;

  if (!start || !end) {
    return <ScheduleGanttMilestone date={start ?? end} label={start ? 'Due start' : 'Due end'} />;
  }

  return (
    <ScheduleGanttBar
      className="border border-sky-500/70 bg-sky-500/10"
      end={addDays(end, 1)}
      label={`Due ${formatDate(start, 'short')} to ${formatDate(end, 'short')}`}
      start={start}
    />
  );
};

const ScheduleGanttActualRange: React.FC<{ row: ScheduleGanttRow }> = ({ row }) => {
  const start = parseScheduleDate(row.actualStart);
  const end = parseScheduleDate(row.actualEnd);

  if (!start) return null;

  return (
    <ScheduleGanttBar
      className={cn('bg-sky-600 shadow-sm', !end && 'rounded-r-none')}
      end={getActualEndForDisplay(start, end)}
      label={
        end
          ? `Actual ${formatDate(start, 'short')} to ${formatDate(end, 'short')}`
          : `Actual ${formatDate(start, 'short')} through today`
      }
      start={start}
    />
  );
};

const ScheduleGanttBar: React.FC<{
  className: string;
  end: Date;
  label: string;
  start: Date;
}> = ({ className, end, label, start }) => {
  const gantt = useGanttContext();
  const left = getGanttOffset(start, gantt);
  const width = getGanttWidth(start, end, gantt);

  return (
    <div
      aria-label={label}
      className={cn('absolute top-1/2 h-4 -translate-y-1/2 rounded-sm', className)}
      role="img"
      style={{ left: Math.round(left), width: Math.max(Math.round(width), 10) }}
      title={label}
    />
  );
};

const ScheduleGanttMilestone: React.FC<{ date: Date | null; label: string }> = ({ date, label }) => {
  const gantt = useGanttContext();

  if (!date) return null;

  const left = getGanttOffset(date, gantt);
  const fullLabel = `${label} ${formatDate(date, 'short')}`;

  return (
    <div
      aria-label={fullLabel}
      className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-sky-500 bg-background"
      role="img"
      style={{ left: Math.round(left) }}
      title={fullLabel}
    />
  );
};

const LegendItem: React.FC<{ className: string; label: string }> = ({ className, label }) => (
  <span className="inline-flex items-center gap-1">
    <span className={cn('h-2 w-5 rounded-sm', className)} />
    {label}
  </span>
);

function parseScheduleDate(value: string | null): Date | null {
  const date = parseDate(value);

  return date ? startOfDay(date) : null;
}

function getActualEndForDisplay(start: Date, end: Date | null): Date {
  if (end) {
    return addDays(startOfDay(end), 1);
  }

  const today = new Date();

  return isBefore(today, start) ? addDays(start, 1) : today;
}
