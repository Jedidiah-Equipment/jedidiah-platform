import { formatDate } from '@pkg/domain';
import type { OffDay } from '@pkg/schema';
import type React from 'react';
import { useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { fromJobCalendarDateKey } from './job-date-key.js';
import { getJobCalendarDayOffset, getJobCalendarDayWidth } from './job-gantt-geometry.js';

export const OffDayBands: React.FC<{
  offDays: OffDay[];
}> = ({ offDays }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-10 h-[calc(100%-var(--gantt-header-height))] w-full">
      {offDays.map((offDay) => {
        const startAt = fromJobCalendarDateKey(offDay.date);
        const left = getJobCalendarDayOffset(offDay.date, gantt);
        const width = getJobCalendarDayWidth(offDay.date, gantt);

        return (
          <div
            className="absolute top-0 h-full border-destructive/10 border-x bg-destructive/5"
            key={offDay.date}
            style={{ left, width }}
            title={`${formatDate(startAt, 'PPP')}${offDay.label ? `: ${offDay.label}` : ''}`}
          />
        );
      })}
    </div>
  );
};
