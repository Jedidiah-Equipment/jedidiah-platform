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

// When a Slot runs and how much work it holds. Start and End label its working days, and Working
// days counts them — the calendar span between the two is longer whenever a closure falls inside,
// which the Slot's own hatching already shows. Overtime is the one exception worth a row: it is
// work bought outside the calendar rather than a gap in it, and it only appears when there is some.
export const SlotDayBreakdownRows: React.FC<{
  dayBreakdown: SlotCalendarDays;
  firstWorkDay: DateOnlyIso;
  lastWorkDay: DateOnlyIso;
}> = ({ dayBreakdown, firstWorkDay, lastWorkDay }) => (
  <>
    <InfoRow label="Start" value={formatDate(firstWorkDay, 'short')} />
    <InfoRow label="End" value={formatDate(lastWorkDay, 'short')} />
    <InfoRow label="Working days" value={dayBreakdown.workingDays} />
    {dayBreakdown.overtimeDays > 0 ? <InfoRow label="Overtime" value={`${dayBreakdown.overtimeDays} day(s)`} /> : null}
  </>
);
