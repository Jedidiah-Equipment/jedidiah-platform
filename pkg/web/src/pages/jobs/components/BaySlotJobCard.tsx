import type { SlotCalendarDaySegment, SlotCalendarDays } from '@pkg/domain';
import type { DateOnlyIso, JobSummary } from '@pkg/schema';
import type React from 'react';
import { useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { getJobGanttOffsetDistance, getJobGanttWidth } from './job-gantt-geometry.js';

type BaySlotJobCardProps = {
  dayBreakdown: SlotCalendarDays;
  job: JobSummary | null;
  jobCode: string;
};

// Rich job cell for a booked Bay slot: product + customer thumbnails, the job's
// identifying text, and a calendar-day breakdown. The slot bar clips this card to the
// slot's duration width, so the most important fields lead and remaining fields gracefully clip.
export const BaySlotJobCard: React.FC<BaySlotJobCardProps> = ({ dayBreakdown, job, jobCode }) => {
  const productName = job?.productName ?? '';
  const customerName = job?.customerCompanyName ?? '';

  return (
    <div className="flex h-full min-w-0 items-center gap-2.5">
      <EntityThumbnail
        className="shrink-0"
        label={productName || jobCode}
        size="lg"
        thumbnailDataUrl={job?.productThumbnailDataUrl}
      />
      <EntityThumbnail className="shrink-0" label={customerName} thumbnailDataUrl={job?.customerThumbnailDataUrl} />
      <div className="flex min-w-0 flex-col justify-center leading-tight">
        <span className="truncate font-semibold text-sm font-mono">{jobCode}</span>
        {job ? (
          <span className="truncate text-muted-foreground text-xs font-mono">{job.productSerialNumber}</span>
        ) : null}
        {productName ? <span className="truncate text-xs">{productName}</span> : null}
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end justify-center pl-2 text-right leading-tight">
        {customerName ? <span className="max-w-40 truncate text-xs">{customerName}</span> : null}
        <span className="font-medium text-sm tabular-nums">{dayBreakdown.workingDays} days</span>
      </div>
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
