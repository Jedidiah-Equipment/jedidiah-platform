import { formatDate } from '@pkg/domain';
import type { BayCalendarExceptionDirection, BaySchedule, OffDay } from '@pkg/schema';
import { IconMoon, IconSun } from '@tabler/icons-react';
import { addDays } from 'date-fns';
import type React from 'react';
import { useState } from 'react';
import {
  getGanttDailyDateFromOffset,
  getGanttOffset,
  getGanttWidth,
  useGanttContext,
} from '@/components/kibo-ui/gantt/index.js';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu.js';
import { cn } from '@/lib/utils.js';
import { fromJobDateKey, toJobDateKey } from './job-date-key.js';

type BayCalendarExceptionSelection = {
  bayId: string;
  date: string;
  direction: BayCalendarExceptionDirection;
};

export const OffDayBands: React.FC<{
  offDays: OffDay[];
}> = ({ offDays }) => {
  const gantt = useGanttContext();

  return (
    <div className="pointer-events-none absolute top-(--gantt-header-height) left-0 z-10 h-[calc(100%-var(--gantt-header-height))] w-full">
      {offDays.map((offDay) => {
        const startAt = fromJobDateKey(offDay.date);
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
          const startAt = fromJobDateKey(exception.date);
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

export const BayCalendarExceptionContextMenu: React.FC<{
  bays: BaySchedule[];
  canEditSchedule: boolean;
  isScheduleMutationPending: boolean;
  onOpenDialog: (selection: BayCalendarExceptionSelection) => void;
}> = ({ bays, canEditSchedule, isScheduleMutationPending, onOpenDialog }) => {
  const gantt = useGanttContext();
  const [selection, setSelection] = useState<{ bayId: string; date: string } | null>(null);

  if (!canEditSchedule) {
    return null;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <button
            aria-label="Bay calendar actions"
            className="pointer-events-auto absolute top-(--gantt-header-height) left-0 z-[15] h-[calc(100%-var(--gantt-header-height))] w-full border-0 bg-transparent p-0"
            onContextMenu={(event) => {
              const nextSelection = getBayDateSelectionFromPointer({ bays, event, gantt });
              setSelection(nextSelection);
            }}
            tabIndex={-1}
            type="button"
          />
        }
      />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem
            disabled={isScheduleMutationPending || !selection}
            onClick={() => {
              if (!selection) return;
              onOpenDialog({ ...selection, direction: 'work' });
            }}
          >
            <IconSun />
            Add bay overtime
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isScheduleMutationPending || !selection}
            onClick={() => {
              if (!selection) return;
              onOpenDialog({ ...selection, direction: 'off' });
            }}
          >
            <IconMoon />
            Add bay closure
          </ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
};

function getBayDateSelectionFromPointer({
  bays,
  event,
  gantt,
}: {
  bays: BaySchedule[];
  event: React.MouseEvent<HTMLElement>;
  gantt: ReturnType<typeof useGanttContext>;
}) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const bay = bays[Math.floor(y / gantt.rowHeight)];

  if (!bay) {
    return null;
  }

  const date = getGanttDailyDateFromOffset(x, gantt);

  return {
    bayId: bay.id,
    date: toJobDateKey(date),
  };
}
