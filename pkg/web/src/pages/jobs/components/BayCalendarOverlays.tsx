import { formatDate } from '@pkg/domain';
import type { BaySchedule, OffDay } from '@pkg/schema';
import { addDays } from 'date-fns';
import type React from 'react';
import { getGanttOffset, getGanttWidth, useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { cn } from '@/lib/utils.js';
import { fromJobCalendarDateKey } from './job-date-key.js';

export const OffDayBands: React.FC<{
  offDays: OffDay[];
}> = ({ offDays }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-10 h-[calc(100%-var(--gantt-header-height))] w-full">
      {offDays.map((offDay) => {
        const startAt = fromJobCalendarDateKey(offDay.date);
        const left = getGanttOffset(startAt, gantt);
        const width = Math.max(getGanttWidth(startAt, addDays(startAt, 1), gantt), 1);

        return (
          <div
            className="absolute top-0 h-full border-destructive/20 border-x bg-destructive/10"
            key={offDay.date}
            style={{ left, width }}
            title={`${formatDate(startAt, 'PPP')}${offDay.label ? `: ${offDay.label}` : ''}`}
          />
        );
      })}
    </div>
  );
};

export const BayExceptionBands: React.FC<{
  bays: BaySchedule[];
}> = ({ bays }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-[12] h-[calc(100%-var(--gantt-header-height))] w-full">
      {bays.flatMap((bay, bayIndex) =>
        bay.calendarExceptions.map((exception) => {
          const startAt = fromJobCalendarDateKey(exception.date);
          const left = getGanttOffset(startAt, gantt);
          const width = Math.max(getGanttWidth(startAt, addDays(startAt, 1), gantt), 1);
          const isOvertime = exception.direction === 'work';

          return (
            <div
              className={cn(
                'absolute border-x',
                isOvertime ? 'border-emerald-500/40 bg-emerald-500/20' : 'border-amber-500/50 bg-amber-500/20',
              )}
              key={`${bay.id}-${exception.date}`}
              style={{
                height: gantt.rowHeight,
                left,
                top: bayIndex * gantt.rowHeight,
                width,
              }}
              title={`${bay.name} ${isOvertime ? 'overtime' : 'closure'}: ${formatDate(startAt, 'PPP')}${
                exception.label ? `: ${exception.label}` : ''
              }`}
            />
          );
        }),
      )}
    </div>
  );
};
