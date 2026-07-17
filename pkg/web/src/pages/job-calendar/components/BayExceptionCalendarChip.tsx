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
  const className = cn(
    'flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs',
    isOvertime ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-700',
    onSelect && 'pointer-events-auto cursor-pointer hover:ring-1 hover:ring-current/40 hover:ring-inset',
  );
  const content = (
    <>
      {isOvertime ? <IconSun className="size-3 shrink-0" /> : <IconMoon className="size-3 shrink-0" />}
      <span className="truncate">{label}</span>
    </>
  );

  return onSelect ? (
    <button
      className={className}
      title={`${label}${detail} — click to edit or remove`}
      onClick={onSelect}
      type="button"
    >
      {content}
    </button>
  ) : (
    <div className={className} title={`${label}${detail}`}>
      {content}
    </div>
  );
};
