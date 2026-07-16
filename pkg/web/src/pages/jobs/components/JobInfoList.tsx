import { formatDate, type SlotCalendarDays } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';
import type React from 'react';

import { cn } from '@/lib/utils.js';

export const InfoList: React.FC<{ children: React.ReactNode; className?: string | undefined }> = ({
  children,
  className,
}) => <dl className={cn('divide-y rounded-lg border text-sm', className)}>{children}</dl>;

export const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 px-3 py-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-right">{value}</dd>
  </div>
);

// Slot Start/End plus its calendar-day breakdown, shared by the Job Sheet and Bay slot hover card.
// Start/End label the Slot's working days; the breakdown below them accounts for the whole span,
// so a Slot opening on an off-day shows a later Start than its leading closure days imply.
export const SlotDayBreakdownRows: React.FC<{
  dayBreakdown: SlotCalendarDays;
  firstWorkDay: DateOnlyIso;
  lastWorkDay: DateOnlyIso;
}> = ({ dayBreakdown, firstWorkDay, lastWorkDay }) => {
  const totalDays = dayBreakdown.workingDays + dayBreakdown.closureDays;

  return (
    <>
      <InfoRow label="Start" value={formatDate(firstWorkDay, 'short')} />
      <InfoRow label="End" value={formatDate(lastWorkDay, 'short')} />
      <InfoRow label="Total days" value={`${totalDays} (incl. off)`} />
      <InfoRow label="Working days" value={dayBreakdown.workingDays} />
      {dayBreakdown.overtimeDays > 0 ? (
        <InfoRow label="Overtime" value={`${dayBreakdown.overtimeDays} day(s)`} />
      ) : null}
      {dayBreakdown.closureDays > 0 ? <InfoRow label="Closure" value={`${dayBreakdown.closureDays} day(s)`} /> : null}
    </>
  );
};
