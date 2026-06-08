import { formatDate, type SlotCalendarDaySegment, type SlotCalendarDays } from '@pkg/domain';
import type { JobSummary } from '@pkg/schema';
import type React from 'react';
import { getGanttWidth, useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';

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
        <span className="truncate font-semibold text-sm">{jobCode}</span>
        {job ? <span className="truncate text-muted-foreground text-xs">{job.productSerialNumber}</span> : null}
        {productName ? <span className="truncate text-xs">{productName}</span> : null}
      </div>
      <div className="ml-auto flex shrink-0 flex-col items-end justify-center pl-2 text-right leading-tight">
        {customerName ? <span className="max-w-40 truncate text-xs">{customerName}</span> : null}
        <span className="font-medium text-sm tabular-nums">{dayBreakdown.workingDays} days</span>
      </div>
    </div>
  );
};

type BaySlotJobDetailsProps = {
  dayBreakdown: SlotCalendarDays;
  endAt: Date;
  job: JobSummary | null;
  jobCode: string;
  startAt: Date;
};

// Full slot detail shown in the click popover — everything that doesn't fit on the card.
export const BaySlotJobDetails: React.FC<BaySlotJobDetailsProps> = ({ dayBreakdown, endAt, job, jobCode, startAt }) => {
  const totalDays = dayBreakdown.workingDays + dayBreakdown.closureDays;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2.5">
        <EntityThumbnail
          className="shrink-0"
          label={job?.productName || jobCode}
          size="lg"
          thumbnailDataUrl={job?.productThumbnailDataUrl}
        />
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="font-semibold">{jobCode}</span>
          {job ? <span className="text-muted-foreground text-xs">{job.productSerialNumber}</span> : null}
        </div>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {job ? <DetailRow label="Product">{`${job.productName} (${job.productModelCode})`}</DetailRow> : null}
        {job?.customerCompanyName ? <DetailRow label="Customer">{job.customerCompanyName}</DetailRow> : null}
        <DetailRow label="Start">{formatDate(startAt, 'long')}</DetailRow>
        <DetailRow label="End">{formatDate(endAt, 'long')}</DetailRow>
        <DetailRow label="Total days">{`${totalDays} (incl. off)`}</DetailRow>
        <DetailRow label="Working days">{String(dayBreakdown.workingDays)}</DetailRow>
        {dayBreakdown.overtimeDays > 0 ? (
          <DetailRow label="Overtime">{`${dayBreakdown.overtimeDays} day(s)`}</DetailRow>
        ) : null}
        {dayBreakdown.closureDays > 0 ? (
          <DetailRow label="Closure">{`${dayBreakdown.closureDays} day(s)`}</DetailRow>
        ) : null}
      </dl>
    </div>
  );
};

const DetailRow: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="text-right font-medium tabular-nums">{children}</dd>
  </>
);

// Diagonal hatch fills, tinted by day kind: red for closures/off-days, green for overtime.
const HATCH_BACKGROUND: Record<'closure' | 'overtime', string> = {
  closure: 'repeating-linear-gradient(45deg, rgb(220 38 38 / 0.14) 0 5px, transparent 5px 10px)',
  overtime: 'repeating-linear-gradient(45deg, rgb(16 185 129 / 0.16) 0 5px, transparent 5px 10px)',
};

// Per-day hatched background painted inside a booked slot cell, aligned to the day grid.
// Working days render nothing; closure/overtime days get the corresponding hatch.
export const BaySlotDayHatch: React.FC<{
  segments: SlotCalendarDaySegment[];
  slotStart: Date;
}> = ({ segments, slotStart }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {segments.map((segment) => {
        if (segment.kind === 'working') {
          return null;
        }

        const left = getGanttWidth(slotStart, segment.startAt, gantt);
        const width = getGanttWidth(segment.startAt, segment.endAt, gantt);

        return (
          <div
            className="absolute top-0 h-full"
            key={segment.startAt.toISOString()}
            style={{ backgroundImage: HATCH_BACKGROUND[segment.kind], left, width }}
          />
        );
      })}
    </div>
  );
};
