import { formatDate, type SlotCalendarDays } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';
import type React from 'react';

export const InfoList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="divide-y rounded-lg border text-sm">{children}</dl>
);

export const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 px-3 py-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-right">{value}</dd>
  </div>
);

// Slot Start/End plus its calendar-day breakdown, shared by the schedule aside and the
// Bay slot hover card so both surfaces describe a slot identically.
export const SlotDayBreakdownRows: React.FC<{
  dayBreakdown: SlotCalendarDays;
  endDate: DateOnlyIso;
  startDate: DateOnlyIso;
}> = ({ dayBreakdown, endDate, startDate }) => {
  const totalDays = dayBreakdown.workingDays + dayBreakdown.closureDays;

  return (
    <>
      <InfoRow label="Start" value={formatDate(startDate, 'short')} />
      <InfoRow label="End" value={formatDate(endDate, 'short')} />
      <InfoRow label="Total days" value={`${totalDays} (incl. off)`} />
      <InfoRow label="Working days" value={dayBreakdown.workingDays} />
      {dayBreakdown.overtimeDays > 0 ? (
        <InfoRow label="Overtime" value={`${dayBreakdown.overtimeDays} day(s)`} />
      ) : null}
      {dayBreakdown.closureDays > 0 ? <InfoRow label="Closure" value={`${dayBreakdown.closureDays} day(s)`} /> : null}
    </>
  );
};
