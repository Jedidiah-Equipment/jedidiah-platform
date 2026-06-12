import { formatDate } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { SLOT_CARD_HEIGHT } from './BaySlotBar.js';
import type { DisplayBaySchedule, GhostSlot } from './bay-schedule-ghosts.js';
import { fromJobCalendarDateKey } from './job-date-key.js';
import { getJobGanttOffset, getJobGanttWidth } from './job-gantt-geometry.js';

/**
 * Client-only ghost Slots for pending Job seeds: positioned like real slot bars but
 * rendered as a non-interactive overlay, visually distinct (dashed, primary-tinted).
 * When a ghost's resolved start date moves, the timeline smooth-scrolls to it.
 */
export const BayScheduleGhostBars: React.FC<{
  bays: DisplayBaySchedule[];
  ghosts: GhostSlot[];
  label: string;
}> = ({ bays, ghosts, label }) => {
  const gantt = useGanttContext();
  const rowIndexByBayId = new Map(bays.map((bay, index) => [bay.id, index]));
  const bayNamesById = new Map(bays.map((bay) => [bay.id, bay.name]));

  useGhostStartDateScroll(ghosts);

  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0 z-30">
      {ghosts.map((ghost) => {
        const rowIndex = rowIndexByBayId.get(ghost.bayId);

        if (rowIndex === undefined) {
          return null;
        }

        const bayName = bayNamesById.get(ghost.bayId);
        const left = getJobGanttOffset(ghost.startDate, gantt);
        const width = Math.max(getJobGanttWidth(ghost.startDate, ghost.endDate, gantt), 28);
        const top = gantt.headerHeight + rowIndex * gantt.rowHeight + (gantt.rowHeight - SLOT_CARD_HEIGHT) / 2;

        return (
          <div
            className="absolute flex items-center overflow-hidden rounded-lg border border-primary border-dashed bg-primary/10 px-2.5 py-1.5 text-primary text-xs shadow-sm"
            key={ghost.id}
            style={{
              height: SLOT_CARD_HEIGHT,
              left,
              top,
              width,
            }}
            title={`${label}${bayName ? ` — ${bayName}` : ''}: ${formatDate(ghost.startDate, 'PPP')} - ${formatDate(ghost.endDate, 'PPP')}`}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium">
                {label}
                <span className="ml-1.5 text-[0.65rem] tabular-nums opacity-80">{ghost.durationDays}d</span>
              </span>
              {bayName ? <span className="truncate text-[0.65rem] opacity-80">{bayName}</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/** Smooth-scrolls the timeline to a ghost whose resolved start date changed (not on first render or new ghosts). */
function useGhostStartDateScroll(ghosts: GhostSlot[]): void {
  const gantt = useGanttContext();
  const scrollToDateRef = useRef(gantt.scrollToDate);
  const previousStartDatesRef = useRef<Map<string, DateOnlyIso> | null>(null);

  useEffect(() => {
    scrollToDateRef.current = gantt.scrollToDate;
  }, [gantt.scrollToDate]);

  useEffect(() => {
    const previousStartDates = previousStartDatesRef.current;
    previousStartDatesRef.current = new Map(ghosts.map((ghost) => [ghost.id, ghost.startDate]));

    if (!previousStartDates) {
      return;
    }

    const movedGhost = ghosts.find((ghost) => {
      const previousStartDate = previousStartDates.get(ghost.id);

      return previousStartDate !== undefined && previousStartDate !== ghost.startDate;
    });

    if (movedGhost) {
      scrollToDateRef.current?.(fromJobCalendarDateKey(movedGhost.startDate), 'smooth', 'center');
    }
  }, [ghosts]);
}
