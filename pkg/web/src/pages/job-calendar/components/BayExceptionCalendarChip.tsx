import { IconMoon, IconSun } from '@tabler/icons-react';
import type React from 'react';
import { cn } from '@/lib/utils.js';
import type { BayExceptionChip } from '../types.js';

export const BayExceptionCalendarChip: React.FC<{
  exception: BayExceptionChip;
  onSelect?: (() => void) | undefined;
}> = ({ exception, onSelect }) => {
  const isOvertime = exception.direction === 'work';
  const label = `${exception.bayName}: ${isOvertime ? 'Overtime' : 'Closure'}`;
  const detail = exception.label ? `: ${exception.label}` : '';

  // A plain (non-focusable) clickable div: it lives inside the day cell button,
  // so it must not be interactive content. Click opens the exception dialog,
  // where the entry can be edited or removed.
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: chip is nested in the day-cell button so it can't be focusable; keyboard users edit/remove via the day's context menu.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above — a role would require focusability that nesting forbids; the context menu is the accessible path.
    <div
      className={cn(
        'flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs',
        isOvertime ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700',
        onSelect && 'cursor-pointer hover:ring-1 hover:ring-current/40 hover:ring-inset',
      )}
      onClick={
        onSelect
          ? (event) => {
              event.stopPropagation();
              onSelect();
            }
          : undefined
      }
      title={`${label}${detail}${onSelect ? ' — click to edit or remove' : ''}`}
    >
      {isOvertime ? <IconSun className="size-3 shrink-0" /> : <IconMoon className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </div>
  );
};
