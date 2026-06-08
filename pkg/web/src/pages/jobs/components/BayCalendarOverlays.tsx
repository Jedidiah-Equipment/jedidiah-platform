import { formatDate } from '@pkg/domain';
import type { OffDay } from '@pkg/schema';
import { addDays } from 'date-fns';
import type React from 'react';
import { getGanttOffset, getGanttWidth, useGanttContext } from '@/components/kibo-ui/gantt/index.js';
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
