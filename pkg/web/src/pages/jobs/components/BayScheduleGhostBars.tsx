import { formatDate } from '@pkg/domain';
import type React from 'react';
import { useGanttContext } from '@/components/kibo-ui/gantt/index.js';
import { SLOT_CARD_HEIGHT } from './BaySlotBar.js';
import type { DisplayBaySchedule, GhostSlot } from './bay-schedule-ghosts.js';
import { getJobGanttOffset, getJobGanttWidth } from './job-gantt-geometry.js';

/**
 * Client-only ghost Slots for pending Job seeds: positioned like real slot bars but
 * rendered as a non-interactive overlay, visually distinct (dashed, primary-tinted).
 */
export const BayScheduleGhostBars: React.FC<{
  bays: DisplayBaySchedule[];
  ghosts: GhostSlot[];
  label: string;
}> = ({ bays, ghosts, label }) => {
  const gantt = useGanttContext();
  const rowIndexByBayId = new Map(bays.map((bay, index) => [bay.id, index]));

  return (
    <div aria-hidden className="pointer-events-none absolute top-0 left-0 z-30">
      {ghosts.map((ghost) => {
        const rowIndex = rowIndexByBayId.get(ghost.bayId);

        if (rowIndex === undefined) {
          return null;
        }

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
            title={`${label}: ${formatDate(ghost.startDate, 'PPP')} - ${formatDate(ghost.endDate, 'PPP')}`}
          >
            <span className="min-w-0 truncate font-medium">
              {label}
              <span className="ml-1.5 text-[0.65rem] tabular-nums opacity-80">{ghost.durationDays}d</span>
            </span>
          </div>
        );
      })}
    </div>
  );
};
