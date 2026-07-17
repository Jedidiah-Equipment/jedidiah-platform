import { getJobDisplayName, type SlotCalendarDaySegment, type SlotCalendarDays } from '@pkg/domain';
import type { DateOnlyIso, JobSummary } from '@pkg/schema';
import type React from 'react';
import { useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { getJobGanttOffsetDistance, getJobGanttWidth } from './job-gantt-geometry.js';

type BaySlotJobCardProps = {
  dayBreakdown: SlotCalendarDays;
  job: JobSummary | null;
  jobCode: string;
};

// Job cell for a booked Bay slot: a small product thumbnail, the job's identifying
// text led by the all-important job code, and a calendar-day count. The slot bar clips
// this card to the slot's duration width, so the job code leads and the rest clips gracefully.
export const BaySlotJobCard: React.FC<BaySlotJobCardProps> = ({ dayBreakdown, job, jobCode }) => {
  const displayName = job ? getJobDisplayName(job) : '';

  return (
    <div className="@container flex h-full min-w-0 items-center gap-2.5">
      <EntityThumbnail
        className="shrink-0"
        label={displayName || jobCode}
        size="lg"
        thumbnailDataUrl={job?.productThumbnailDataUrl}
      />
      <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <span className="truncate font-mono font-semibold text-sm">{jobCode}</span>
        {job?.cancelledAt ? (
          <Badge className="w-fit border-muted-foreground/40 text-muted-foreground" variant="outline">
            Cancelled
          </Badge>
        ) : null}
        {job?.productSerialNumber ? (
          <span className="truncate font-mono text-muted-foreground text-xs">{job.productSerialNumber}</span>
        ) : null}
        {displayName ? <span className="truncate text-muted-foreground text-xs">{displayName}</span> : null}
      </div>
      {/* Job code wins tight slots: the day count only shows once the slot is wide enough. */}
      <span className="ml-auto hidden shrink-0 pl-2 text-right font-medium text-muted-foreground text-sm tabular-nums @[14rem]:inline">
        {dayBreakdown.workingDays} days
      </span>
    </div>
  );
};

// Diagonal hatch fills, tinted by day kind: red for closures/off-days, green for overtime.
const HATCH_BACKGROUND: Record<'closure' | 'overtime', string> = {
  closure: 'repeating-linear-gradient(45deg, rgb(220 38 38 / 0.14) 0 5px, transparent 5px 10px)',
  overtime: 'repeating-linear-gradient(45deg, rgb(16 185 129 / 0.16) 0 5px, transparent 5px 10px)',
};

// Per-day hatched background painted inside a booked slot cell, aligned to the day grid.
// Working days render nothing; closure/overtime days get the corresponding hatch.
export const BaySlotDayHatch: React.FC<{
  segments: SlotCalendarDaySegment[];
  slotStart: DateOnlyIso;
}> = ({ segments, slotStart }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {segments.map((segment) => {
        if (segment.kind === 'working') {
          return null;
        }

        const left = getJobGanttOffsetDistance(slotStart, segment.startDate, gantt);
        const width = getJobGanttWidth(segment.startDate, segment.endDate, gantt);

        return (
          <div
            className="absolute top-0 h-full"
            key={segment.startDate}
            style={{ backgroundImage: HATCH_BACKGROUND[segment.kind], left, width }}
          />
        );
      })}
    </div>
  );
};
