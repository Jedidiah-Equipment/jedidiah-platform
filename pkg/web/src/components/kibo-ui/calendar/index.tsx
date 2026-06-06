import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

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
  children: (props: { date: Date; dateKey: string; isCurrentMonth: boolean }) => ReactNode;
  getDateKey?: (date: Date) => string;
};

export function CalendarBody({ children, getDateKey = (date) => format(date, 'yyyy-MM-dd') }: CalendarBodyProps) {
  const { month } = useCalendarContext();
  const monthStart = startOfMonth(month);
  const days = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(endOfMonth(month)),
  });

  return (
    <div className="grid flex-1 grid-cols-7">
      {days.map((day, index) => {
        const key = getDateKey(day);
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
            {children({ date: day, dateKey: key, isCurrentMonth })}
          </div>
        );
      })}
    </div>
  );
}

function useCalendarContext() {
  const value = useContext(CalendarContext);

  if (!value) {
    throw new Error('Calendar components must be rendered inside CalendarProvider');
  }

  return value;
}
