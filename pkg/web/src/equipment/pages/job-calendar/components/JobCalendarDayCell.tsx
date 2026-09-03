import { formatDate } from '@pkg/domain';
import type { BayCalendarExceptionDirection, OffDay } from '@pkg/schema';
import { IconMoon, IconSun, IconTrash } from '@tabler/icons-react';
import type React from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu.js';
import { cn } from '@/lib/utils.js';
import { isToday } from '../bay-exceptions.js';
import type { BayExceptionChip } from '../types.js';
import { BayExceptionCalendarChip } from './BayExceptionCalendarChip.js';

const visibleBayExceptionLimit = 3;

type JobCalendarDayCellProps = {
  date: Date;
  isCurrentMonth: boolean;
  offDay: OffDay | null;
  bayExceptionChips: BayExceptionChip[];
  canEditCalendar: boolean;
  canEditBayException: (chip: BayExceptionChip) => boolean;
  canEditBaySchedule: boolean;
  isBayExceptionMutationPending: boolean;
  hasBays: boolean;
  onSelectDay: (date: Date, offDay: OffDay | null) => void;
  onAddBayException: (direction: BayCalendarExceptionDirection) => void;
  onSelectBayException: (chip: BayExceptionChip) => void;
};

export const JobCalendarDayCell: React.FC<JobCalendarDayCellProps> = ({
  date,
  isCurrentMonth,
  offDay,
  bayExceptionChips,
  canEditCalendar,
  canEditBayException,
  canEditBaySchedule,
  isBayExceptionMutationPending,
  hasBays,
  onSelectDay,
  onAddBayException,
  onSelectBayException,
}) => {
  const visibleBayExceptionChips = bayExceptionChips.slice(0, visibleBayExceptionLimit);
  const hiddenBayExceptionCount = bayExceptionChips.length - visibleBayExceptionChips.length;
  const editableBayExceptionChips = bayExceptionChips.filter(canEditBayException);

  const dayCell = (
    <div
      className={cn(
        'relative flex h-full w-full flex-col gap-1 p-1.5 text-left transition-colors',
        canEditCalendar && 'hover:bg-muted/70',
      )}
    >
      <button
        aria-disabled={!canEditCalendar}
        aria-label={`Edit calendar for ${formatDate(date, 'PPP')}`}
        className="absolute inset-0 z-0 cursor-default outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={canEditCalendar ? 0 : -1}
        onClick={() => {
          if (canEditCalendar) onSelectDay(date, offDay);
        }}
        type="button"
      />
      <div className="pointer-events-none relative z-10 flex h-full min-w-0 flex-col gap-1">
        <span
          className={cn(
            'ml-auto flex size-7 items-center justify-center rounded-sm text-xs',
            isToday(date) && 'bg-primary text-primary-foreground',
            !isCurrentMonth && 'text-muted-foreground',
            offDay && !isToday(date) && 'bg-destructive/10 text-destructive',
          )}
        >
          {formatDate(date, 'd')}
        </span>
        {offDay ? (
          <div
            className="flex min-w-0 items-center gap-1.5 rounded-sm bg-destructive/10 px-1.5 py-1 text-destructive text-xs"
            title={`${formatDate(date, 'PPP')}${offDay.label ? `: ${offDay.label}` : ''}`}
          >
            <div className="size-1.5 shrink-0 rounded-full bg-destructive" />
            <span className="truncate">{offDay.label ?? 'Off-Day'}</span>
          </div>
        ) : null}
        {visibleBayExceptionChips.map((exception) => (
          <BayExceptionCalendarChip
            exception={exception}
            key={`${exception.bayId}-${exception.date}`}
            onSelect={
              canEditBaySchedule && canEditBayException(exception) ? () => onSelectBayException(exception) : undefined
            }
          />
        ))}
        {hiddenBayExceptionCount > 0 ? (
          <div className="rounded-sm bg-muted px-1.5 py-1 text-muted-foreground text-xs">
            +{hiddenBayExceptionCount} more
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!canEditBaySchedule) {
    return dayCell;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger render={dayCell} />
      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem
            disabled={isBayExceptionMutationPending || !hasBays}
            onClick={() => onAddBayException('work')}
          >
            <IconSun />
            Add bay overtime
          </ContextMenuItem>
          <ContextMenuItem
            disabled={isBayExceptionMutationPending || !hasBays}
            onClick={() => onAddBayException('off')}
          >
            <IconMoon />
            Add bay closure
          </ContextMenuItem>
        </ContextMenuGroup>
        {editableBayExceptionChips.length > 0 ? (
          <ContextMenuGroup>
            {editableBayExceptionChips.map((chip) => (
              <ContextMenuItem
                disabled={isBayExceptionMutationPending}
                key={`${chip.bayId}-${chip.date}-edit`}
                onClick={() => onSelectBayException(chip)}
              >
                <IconTrash />
                Remove {chip.bayName} {chip.direction === 'work' ? 'overtime' : 'closure'}
              </ContextMenuItem>
            ))}
          </ContextMenuGroup>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
};
