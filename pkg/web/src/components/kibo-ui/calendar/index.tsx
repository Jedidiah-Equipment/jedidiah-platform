import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import type { ReactNode } from 'react';
import { createContext, memo, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

export type CalendarFeature = {
  date: Date;
  id: string;
  name: string;
  status: {
    color: string;
    name: string;
  };
};

type CalendarContextValue = {
  month: Date;
  setMonth: (date: Date) => void;
};

const CalendarContext = createContext<CalendarContextValue | null>(null);

export type CalendarProviderProps = {
  children: ReactNode;
  className?: string;
  defaultMonth?: Date;
};

export function CalendarProvider({ children, className, defaultMonth }: CalendarProviderProps) {
  const [month, setMonth] = useState(() => startOfMonth(defaultMonth ?? new Date()));
  const value = useMemo(() => ({ month, setMonth }), [month]);

  return (
    <CalendarContext.Provider value={value}>
      <div className={cn('relative flex flex-col border border-border/70 bg-background', className)}>{children}</div>
    </CalendarContext.Provider>
  );
}

export function CalendarDate({ children }: { children: ReactNode }) {
  return <div className="flex items-center justify-between border-border/70 border-b p-3">{children}</div>;
}

export function CalendarDatePagination() {
  const { month, setMonth } = useCalendarContext();

  return (
    <div className="flex items-center gap-1">
      <Button
        aria-label="Previous month"
        onClick={() => setMonth(addMonths(month, -1))}
        size="icon"
        type="button"
        variant="ghost"
      >
        <IconChevronLeft />
      </Button>
      <Button
        aria-label="Next month"
        onClick={() => setMonth(addMonths(month, 1))}
        size="icon"
        type="button"
        variant="ghost"
      >
        <IconChevronRight />
      </Button>
    </div>
  );
}

export function CalendarMonthLabel() {
  const { month } = useCalendarContext();

  return <p className="font-medium text-sm">{format(month, 'MMMM yyyy')}</p>;
}

export function CalendarHeader({ className }: { className?: string }) {
  const weekStart = startOfWeek(new Date(2026, 0, 4));
  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart) });

  return (
    <div className={cn('grid grid-cols-7 border-border/70 border-b', className)}>
      {days.map((day) => (
        <div className="p-2 text-right text-muted-foreground text-xs" key={day.toISOString()}>
          {format(day, 'EEE')}
        </div>
      ))}
    </div>
  );
}

export type CalendarBodyProps = {
  children: (props: { date: Date; features: CalendarFeature[]; isCurrentMonth: boolean }) => ReactNode;
  features: CalendarFeature[];
};

export function CalendarBody({ children, features }: CalendarBodyProps) {
  const { month } = useCalendarContext();
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(month)),
  });
  const featuresByDate = useMemo(() => {
    const result = new Map<string, CalendarFeature[]>();

    for (const feature of features) {
      const key = format(feature.date, 'yyyy-MM-dd');
      result.set(key, [...(result.get(key) ?? []), feature]);
    }

    return result;
  }, [features]);

  return (
    <div className="grid flex-1 grid-cols-7">
      {days.map((day, index) => {
        const key = format(day, 'yyyy-MM-dd');
        const isCurrentMonth = day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear();

        return (
          <div
            className={cn(
              'relative min-h-28 border-border/70 border-r border-b',
              index % 7 === 6 && 'border-r-0',
              !isCurrentMonth && 'bg-muted/35 text-muted-foreground',
            )}
            key={key}
          >
            {children({ date: day, features: featuresByDate.get(key) ?? [], isCurrentMonth })}
          </div>
        );
      })}
    </div>
  );
}

export type CalendarItemProps = {
  className?: string;
  feature: CalendarFeature;
};

export const CalendarItem = memo(({ className, feature }: CalendarItemProps) => (
  <div className={cn('flex min-w-0 items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs', className)}>
    <div className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: feature.status.color }} />
    <span className="truncate">{feature.name}</span>
  </div>
));

CalendarItem.displayName = 'CalendarItem';

function useCalendarContext() {
  const value = useContext(CalendarContext);

  if (!value) {
    throw new Error('Calendar components must be rendered inside CalendarProvider');
  }

  return value;
}
