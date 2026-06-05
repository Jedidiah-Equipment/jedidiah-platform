// biome-ignore-all lint/a11y/useSemanticElements: kibo-ui vendored sidebar items preserve registry interaction semantics.
// biome-ignore-all lint/suspicious/noArrayIndexKey: kibo-ui vendored timeline columns are generated from stable date ranges.

import { IconTrash } from '@tabler/icons-react';
import {
  addDays,
  differenceInDays,
  differenceInHours,
  differenceInMonths,
  endOfDay,
  endOfMonth,
  format,
  formatDate,
  formatDistance,
  getDate,
  getDaysInMonth,
  isSameDay,
  startOfDay,
  startOfMonth,
} from 'date-fns';
import throttle from 'lodash.throttle';
import type { CSSProperties, FC, KeyboardEventHandler, MouseEventHandler, ReactNode, RefObject } from 'react';
import { createContext, memo, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';

export type GanttStatus = {
  id: string;
  name: string;
  color: string;
};

export type GanttFeature = {
  id: string;
  name: string;
  startAt: Date;
  endAt: Date | null;
  status: GanttStatus;
  lane?: string; // Optional: features with the same lane will share a row
};

export type GanttMarkerProps = {
  id: string;
  date: Date;
  label: string;
};

export type Range = 'daily' | 'monthly' | 'quarterly';

export type TimelineData = {
  year: number;
  quarters: {
    months: {
      days: number;
    }[];
  }[];
}[];

export type GanttContextProps = {
  zoom: number;
  range: Range;
  columnWidth: number;
  sidebarWidth: number;
  headerHeight: number;
  rowHeight: number;
  placeholderLength: number;
  timelineData: TimelineData;
  ref: RefObject<HTMLDivElement | null> | null;
  scrollToFeature?: ((feature: GanttFeature) => void) | undefined;
};

const getDifferenceIn = (range: Range) => {
  let fn = differenceInDays;

  if (range === 'monthly' || range === 'quarterly') {
    fn = differenceInMonths;
  }

  return fn;
};

const getInnerDifferenceIn = (range: Range) => {
  let fn = differenceInHours;

  if (range === 'monthly' || range === 'quarterly') {
    fn = differenceInDays;
  }

  return fn;
};

const getStartOf = (range: Range) => {
  let fn = startOfDay;

  if (range === 'monthly' || range === 'quarterly') {
    fn = startOfMonth;
  }

  return fn;
};

const getEndOf = (range: Range) => {
  let fn = endOfDay;

  if (range === 'monthly' || range === 'quarterly') {
    fn = endOfMonth;
  }

  return fn;
};

const createTimelineYearData = (year: number): TimelineData[number] => ({
  year,
  quarters: new Array(4).fill(null).map((_, quarterIndex) => ({
    months: new Array(3).fill(null).map((_, monthIndex) => {
      const month = quarterIndex * 3 + monthIndex;
      return {
        days: getDaysInMonth(new Date(year, month, 1)),
      };
    }),
  })),
});

const createInitialTimelineData = (today: Date) => [
  createTimelineYearData(today.getFullYear() - 1),
  createTimelineYearData(today.getFullYear()),
  createTimelineYearData(today.getFullYear() + 1),
];

const getOffset = (date: Date, timelineStartDate: Date, context: GanttContextProps) => {
  const parsedColumnWidth = (context.columnWidth * context.zoom) / 100;
  const differenceIn = getDifferenceIn(context.range);
  const startOf = getStartOf(context.range);
  const fullColumns = differenceIn(startOf(date), timelineStartDate);

  if (context.range === 'daily') {
    return parsedColumnWidth * fullColumns + calculateInnerOffset(date, context.range, parsedColumnWidth);
  }

  const partialColumns = date.getDate();
  const daysInMonth = getDaysInMonth(date);
  const pixelsPerDay = parsedColumnWidth / daysInMonth;

  return fullColumns * parsedColumnWidth + partialColumns * pixelsPerDay;
};

const getWidth = (startAt: Date, endAt: Date | null, context: GanttContextProps) => {
  const parsedColumnWidth = (context.columnWidth * context.zoom) / 100;

  if (!endAt) {
    return parsedColumnWidth * 2;
  }

  const differenceIn = getDifferenceIn(context.range);

  if (context.range === 'daily') {
    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const delta = (endAt.getTime() - startAt.getTime()) / millisecondsPerDay;

    return parsedColumnWidth * (delta > 0 ? delta : 1);
  }

  const daysInStartMonth = getDaysInMonth(startAt);
  const pixelsPerDayInStartMonth = parsedColumnWidth / daysInStartMonth;

  if (isSameDay(startAt, endAt)) {
    return pixelsPerDayInStartMonth;
  }

  const innerDifferenceIn = getInnerDifferenceIn(context.range);
  const startOf = getStartOf(context.range);

  if (isSameDay(startOf(startAt), startOf(endAt))) {
    return innerDifferenceIn(endAt, startAt) * pixelsPerDayInStartMonth;
  }

  const startRangeOffset = daysInStartMonth - getDate(startAt);
  const endRangeOffset = getDate(endAt);
  const fullRangeOffset = differenceIn(startOf(endAt), startOf(startAt));
  const daysInEndMonth = getDaysInMonth(endAt);
  const pixelsPerDayInEndMonth = parsedColumnWidth / daysInEndMonth;

  return (
    (fullRangeOffset - 1) * parsedColumnWidth +
    startRangeOffset * pixelsPerDayInStartMonth +
    endRangeOffset * pixelsPerDayInEndMonth
  );
};

const calculateInnerOffset = (date: Date, range: Range, columnWidth: number) => {
  if (range === 'daily') {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const elapsed = date.getTime() - dayStart.getTime();
    const duration = dayEnd.getTime() - dayStart.getTime();

    return (elapsed / duration) * columnWidth;
  }

  const startOf = getStartOf(range);
  const endOf = getEndOf(range);
  const differenceIn = getInnerDifferenceIn(range);
  const startOfRange = startOf(date);
  const endOfRange = endOf(date);
  const totalRangeDays = differenceIn(endOfRange, startOfRange);
  const dayOfMonth = date.getDate();

  return (dayOfMonth / totalRangeDays) * columnWidth;
};

const GanttContext = createContext<GanttContextProps>({
  zoom: 100,
  range: 'monthly',
  columnWidth: 50,
  headerHeight: 60,
  sidebarWidth: 300,
  rowHeight: 36,
  placeholderLength: 2,
  timelineData: [],
  ref: null,
  scrollToFeature: undefined,
});

export const useGanttContext = () => useContext(GanttContext);

export function getGanttOffset(date: Date, context: GanttContextProps): number {
  const timelineStartDate = new Date(context.timelineData.at(0)?.year ?? date.getFullYear(), 0, 1);

  return getOffset(date, timelineStartDate, context);
}

export function getGanttWidth(startAt: Date, endAt: Date | null, context: GanttContextProps): number {
  return getWidth(startAt, endAt, context);
}

export type GanttContentHeaderProps = {
  renderHeaderItem: (index: number) => ReactNode;
  title: string;
  columns: number;
};

export const GanttContentHeader: FC<GanttContentHeaderProps> = ({ title, columns, renderHeaderItem }) => {
  const id = useId();

  return (
    <div
      className="sticky top-0 z-20 grid w-full shrink-0 bg-backdrop/90 backdrop-blur-sm"
      style={{ height: 'var(--gantt-header-height)' }}
    >
      <div>
        <div
          className="sticky inline-flex whitespace-nowrap px-3 py-2 text-muted-foreground text-xs"
          style={{
            left: 'var(--gantt-sidebar-width)',
          }}
        >
          <p>{title}</p>
        </div>
      </div>
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
        }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div className="shrink-0 border-border/50 border-b py-1 text-center text-xs" key={`${id}-${index}`}>
            {renderHeaderItem(index)}
          </div>
        ))}
      </div>
    </div>
  );
};

const DailyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) =>
    year.quarters
      .flatMap((quarter) => quarter.months)
      .map((month, index) => (
        <div className="relative flex flex-col" key={`${year.year}-${index}`}>
          <GanttContentHeader
            columns={month.days}
            renderHeaderItem={(item: number) => (
              <div className="flex items-center justify-center gap-1">
                <p>{format(addDays(new Date(year.year, index, 1), item), 'd')}</p>
                <p className="text-muted-foreground">{format(addDays(new Date(year.year, index, 1), item), 'EEEEE')}</p>
              </div>
            )}
            title={format(new Date(year.year, index, 1), 'MMMM yyyy')}
          />
          <GanttColumns
            columns={month.days}
            isColumnSecondary={(item: number) => [0, 6].includes(addDays(new Date(year.year, index, 1), item).getDay())}
          />
        </div>
      )),
  );
};

const MonthlyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) => (
    <div className="relative flex flex-col" key={year.year}>
      <GanttContentHeader
        columns={year.quarters.flatMap((quarter) => quarter.months).length}
        renderHeaderItem={(item: number) => <p>{format(new Date(year.year, item, 1), 'MMM')}</p>}
        title={`${year.year}`}
      />
      <GanttColumns columns={year.quarters.flatMap((quarter) => quarter.months).length} />
    </div>
  ));
};

const QuarterlyHeader: FC = () => {
  const gantt = useContext(GanttContext);

  return gantt.timelineData.map((year) =>
    year.quarters.map((quarter, quarterIndex) => (
      <div className="relative flex flex-col" key={`${year.year}-${quarterIndex}`}>
        <GanttContentHeader
          columns={quarter.months.length}
          renderHeaderItem={(item: number) => <p>{format(new Date(year.year, quarterIndex * 3 + item, 1), 'MMM')}</p>}
          title={`Q${quarterIndex + 1} ${year.year}`}
        />
        <GanttColumns columns={quarter.months.length} />
      </div>
    )),
  );
};

const headers: Record<Range, FC> = {
  daily: DailyHeader,
  monthly: MonthlyHeader,
  quarterly: QuarterlyHeader,
};

export type GanttHeaderProps = {
  className?: string;
};

export const GanttHeader: FC<GanttHeaderProps> = ({ className }) => {
  const gantt = useContext(GanttContext);
  const Header = headers[gantt.range];

  return (
    <div className={cn('-space-x-px flex h-full w-max divide-x divide-border/50', className)}>
      <Header />
    </div>
  );
};

export type GanttSidebarItemProps = {
  feature: GanttFeature;
  onSelectItem?: (id: string) => void;
  className?: string;
};

export const GanttSidebarItem: FC<GanttSidebarItemProps> = ({ feature, onSelectItem, className }) => {
  const gantt = useContext(GanttContext);
  const tempEndAt =
    feature.endAt && isSameDay(feature.startAt, feature.endAt) ? addDays(feature.endAt, 1) : feature.endAt;
  const duration = tempEndAt
    ? formatDistance(feature.startAt, tempEndAt)
    : `${formatDistance(feature.startAt, new Date())} so far`;

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (event.target === event.currentTarget) {
      // Scroll to the feature in the timeline
      gantt.scrollToFeature?.(feature);
      // Call the original onSelectItem callback
      onSelectItem?.(feature.id);
    }
  };

  const handleKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key === 'Enter') {
      // Scroll to the feature in the timeline
      gantt.scrollToFeature?.(feature);
      // Call the original onSelectItem callback
      onSelectItem?.(feature.id);
    }
  };

  return (
    <div
      className={cn('relative flex items-center gap-2.5 p-2.5 text-xs hover:bg-secondary', className)}
      key={feature.id}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      style={{
        height: 'var(--gantt-row-height)',
      }}
      tabIndex={0}
    >
      {/* <Checkbox onCheckedChange={handleCheck} className="shrink-0" /> */}
      <div
        className="pointer-events-none h-2 w-2 shrink-0 rounded-full"
        style={{
          backgroundColor: feature.status.color,
        }}
      />
      <p className="pointer-events-none flex-1 truncate text-left font-medium">{feature.name}</p>
      <p className="pointer-events-none text-muted-foreground">{duration}</p>
    </div>
  );
};

export type GanttSidebarHeaderProps = {
  secondaryTitle?: string | null | undefined;
  title?: string | undefined;
};

export const GanttSidebarHeader: FC<GanttSidebarHeaderProps> = ({ secondaryTitle = 'Duration', title = 'Issues' }) => (
  <div
    className="sticky top-0 z-10 flex shrink-0 items-end justify-between gap-2.5 border-border/50 border-b bg-backdrop/90 p-2.5 font-medium text-muted-foreground text-xs backdrop-blur-sm"
    style={{ height: 'var(--gantt-header-height)' }}
  >
    {/* <Checkbox className="shrink-0" /> */}
    <p className="flex-1 truncate text-left">{title}</p>
    {secondaryTitle ? <p className="shrink-0">{secondaryTitle}</p> : null}
  </div>
);

export type GanttSidebarGroupProps = {
  children: ReactNode;
  name: string;
  className?: string;
};

export const GanttSidebarGroup: FC<GanttSidebarGroupProps> = ({ children, name, className }) => (
  <div className={className}>
    <p
      className="w-full truncate p-2.5 text-left font-medium text-muted-foreground text-xs"
      style={{ height: 'var(--gantt-row-height)' }}
    >
      {name}
    </p>
    <div className="divide-y divide-border/50">{children}</div>
  </div>
);

export type GanttSidebarProps = {
  children: ReactNode;
  className?: string;
  secondaryTitle?: string | null | undefined;
  title?: string | undefined;
};

export const GanttSidebar: FC<GanttSidebarProps> = ({ children, className, secondaryTitle, title }) => (
  <div
    className={cn(
      'sticky left-0 z-30 h-max min-h-full overflow-clip border-border/50 border-r bg-background/90 backdrop-blur-md',
      className,
    )}
    data-roadmap-ui="gantt-sidebar"
  >
    <GanttSidebarHeader secondaryTitle={secondaryTitle} title={title} />
    <div className="space-y-4">{children}</div>
  </div>
);

export type GanttColumnProps = {
  isSecondary: boolean;
};

export const GanttColumn: FC<GanttColumnProps> = memo(({ isSecondary }) => (
  <div className={cn('group relative h-full overflow-hidden', isSecondary ? 'bg-secondary' : '')} />
));

GanttColumn.displayName = 'GanttColumn';

export type GanttColumnsProps = {
  columns: number;
  isColumnSecondary?: (item: number) => boolean;
};

export const GanttColumns: FC<GanttColumnsProps> = ({ columns, isColumnSecondary }) => {
  const id = useId();

  return (
    <div
      className="divide grid h-full w-full divide-x divide-border/50"
      style={{
        gridTemplateColumns: `repeat(${columns}, var(--gantt-column-width))`,
      }}
    >
      {Array.from({ length: columns }).map((_, index) => (
        <GanttColumn isSecondary={isColumnSecondary?.(index) ?? false} key={`${id}-${index}`} />
      ))}
    </div>
  );
};

export type GanttFeatureListProps = {
  className?: string;
  children: ReactNode;
};

export const GanttFeatureList: FC<GanttFeatureListProps> = ({ className, children }) => (
  <div
    className={cn('absolute top-0 left-0 h-[calc(100%-var(--gantt-header-height))] w-max space-y-4', className)}
    style={{ marginTop: 'var(--gantt-header-height)' }}
  >
    {children}
  </div>
);

export const GanttMarker: FC<
  GanttMarkerProps & {
    onRemove?: (id: string) => void;
    className?: string;
  }
> = memo(({ label, date, id, onRemove, className }) => {
  const gantt = useContext(GanttContext);
  const differenceIn = useMemo(() => getDifferenceIn(gantt.range), [gantt.range]);
  const timelineStartDate = useMemo(() => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1), [gantt.timelineData]);

  // Memoize expensive calculations
  const offset = useMemo(() => differenceIn(date, timelineStartDate), [differenceIn, date, timelineStartDate]);
  const innerOffset = useMemo(
    () => calculateInnerOffset(date, gantt.range, (gantt.columnWidth * gantt.zoom) / 100),
    [date, gantt.range, gantt.columnWidth, gantt.zoom],
  );

  const handleRemove = useCallback(() => onRemove?.(id), [onRemove, id]);

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full select-none flex-col items-center justify-center overflow-visible"
      style={{
        width: 0,
        transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
      }}
    >
      <ContextMenu>
        <ContextMenuTrigger
          render={
            <div
              className={cn(
                'group pointer-events-auto sticky top-0 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2 py-1 text-foreground text-xs',
                className,
              )}
            />
          }
        >
          {label}
          <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
            {formatDate(date, 'MMM dd, yyyy')}
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          {onRemove ? (
            <ContextMenuItem className="flex items-center gap-2 text-destructive" onClick={handleRemove}>
              <IconTrash size={16} />
              Remove marker
            </ContextMenuItem>
          ) : null}
        </ContextMenuContent>
      </ContextMenu>
      <div className={cn('h-full w-px bg-card', className)} />
    </div>
  );
});

GanttMarker.displayName = 'GanttMarker';

export type GanttProviderProps = {
  range?: Range;
  zoom?: number;
  initialDateAlignment?: 'center' | 'end' | 'start';
  initialDate?: Date | undefined;
  onVisibleWindowChange?: ((window: { end: Date; start: Date }) => void) | undefined;
  children: ReactNode;
  className?: string;
};

export const GanttProvider: FC<GanttProviderProps> = ({
  zoom = 100,
  range = 'monthly',
  initialDateAlignment = 'end',
  initialDate,
  onVisibleWindowChange,
  children,
  className,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollDoneRef = useRef(false);
  const notifyVisibleWindowChangeRef = useRef<(scrollElement: HTMLDivElement) => void>(() => {});
  const [timelineData, setTimelineData] = useState<TimelineData>(createInitialTimelineData(initialDate ?? new Date()));
  const [sidebarWidth, setSidebarWidth] = useState(0);

  const headerHeight = 60;
  const rowHeight = 36;
  let columnWidth = 50;

  if (range === 'monthly') {
    columnWidth = 150;
  } else if (range === 'quarterly') {
    columnWidth = 100;
  }

  // Memoize CSS variables to prevent unnecessary re-renders
  const cssVariables = useMemo(
    () =>
      ({
        '--gantt-zoom': `${zoom}`,
        '--gantt-column-width': `${(zoom / 100) * columnWidth}px`,
        '--gantt-header-height': `${headerHeight}px`,
        '--gantt-row-height': `${rowHeight}px`,
        '--gantt-sidebar-width': `${sidebarWidth}px`,
      }) as CSSProperties,
    [zoom, columnWidth, sidebarWidth],
  );

  const notifyVisibleWindowChange = useCallback(
    (scrollElement: HTMLDivElement) => {
      if (!onVisibleWindowChange) {
        return;
      }

      const timelineStartDate = new Date(timelineData[0]?.year ?? new Date().getFullYear(), 0, 1);
      const renderedColumnWidth = (zoom / 100) * columnWidth;
      const visibleStartOffset = Math.max(scrollElement.scrollLeft - sidebarWidth, 0);
      const visibleEndOffset = Math.max(scrollElement.scrollLeft + scrollElement.clientWidth - sidebarWidth, 0);
      const start = addDays(timelineStartDate, Math.floor(visibleStartOffset / renderedColumnWidth));
      const end = addDays(timelineStartDate, Math.ceil(visibleEndOffset / renderedColumnWidth));

      onVisibleWindowChange({ end, start });
    },
    [columnWidth, onVisibleWindowChange, sidebarWidth, timelineData, zoom],
  );
  useEffect(() => {
    notifyVisibleWindowChangeRef.current = notifyVisibleWindowChange;
  }, [notifyVisibleWindowChange]);

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement && !initialScrollDoneRef.current) {
      if (initialDate && sidebarWidth === 0) {
        return;
      }

      const timelineStartDate = new Date(timelineData[0]?.year ?? new Date().getFullYear(), 0, 1);
      const renderedColumnWidth = (zoom / 100) * columnWidth;
      const fallbackScrollLeft = scrollElement.scrollWidth / 2 - scrollElement.clientWidth / 2;

      if (initialDate) {
        const offset = getOffset(initialDate, timelineStartDate, {
          zoom,
          range,
          columnWidth,
          sidebarWidth,
          headerHeight,
          rowHeight,
          placeholderLength: 2,
          timelineData,
          ref: scrollRef,
        });
        const visibleTimelineWidth = scrollElement.clientWidth - sidebarWidth;
        let scrollLeft = offset - visibleTimelineWidth + renderedColumnWidth * 3;
        if (initialDateAlignment === 'center') {
          scrollLeft = offset - visibleTimelineWidth / 2;
        } else if (initialDateAlignment === 'start') {
          scrollLeft = offset - renderedColumnWidth * 2;
        }

        scrollElement.scrollLeft = Math.max(0, scrollLeft);
      } else {
        scrollElement.scrollLeft = fallbackScrollLeft;
      }
      initialScrollDoneRef.current = true;
      notifyVisibleWindowChange(scrollElement);
    }
  }, [
    columnWidth,
    initialDate,
    initialDateAlignment,
    notifyVisibleWindowChange,
    range,
    sidebarWidth,
    timelineData,
    zoom,
  ]);

  // Update sidebar width when DOM is ready
  useEffect(() => {
    const updateSidebarWidth = () => {
      const sidebarElement = scrollRef.current?.querySelector('[data-roadmap-ui="gantt-sidebar"]');
      const newWidth = sidebarElement ? 300 : 0;
      setSidebarWidth(newWidth);
    };

    // Update immediately
    updateSidebarWidth();

    // Also update on resize or when children change
    const observer = new MutationObserver(updateSidebarWidth);
    if (scrollRef.current) {
      observer.observe(scrollRef.current, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // Keep the throttled listener stable; timeline edits use functional state updates.
  const handleScroll = useCallback(
    throttle(() => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      const { scrollLeft, scrollWidth, clientWidth } = scrollElement;

      if (scrollLeft === 0) {
        setTimelineData((currentTimelineData) => {
          const firstYear = currentTimelineData[0]?.year;

          if (!firstYear) {
            return currentTimelineData;
          }

          return [createTimelineYearData(firstYear - 1), ...currentTimelineData];
        });

        // Scroll a bit forward so it's not at the very start
        scrollElement.scrollLeft = scrollElement.clientWidth;
      } else if (scrollLeft + clientWidth >= scrollWidth) {
        setTimelineData((currentTimelineData) => {
          const lastYear = currentTimelineData.at(-1)?.year;

          if (!lastYear) {
            return currentTimelineData;
          }

          return [...currentTimelineData, createTimelineYearData(lastYear + 1)];
        });

        // Scroll a bit back so it's not at the very end
        scrollElement.scrollLeft = scrollElement.scrollWidth - scrollElement.clientWidth;
      }

      notifyVisibleWindowChangeRef.current(scrollElement);
    }, 100),
    [],
  );

  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
    }

    return () => {
      // Fix memory leak by properly referencing the scroll element
      if (scrollElement) {
        scrollElement.removeEventListener('scroll', handleScroll);
      }
    };
  }, [handleScroll]);

  const scrollToFeature = useCallback(
    (feature: GanttFeature) => {
      const scrollElement = scrollRef.current;
      if (!scrollElement) {
        return;
      }

      // Calculate timeline start date from timelineData
      const timelineStartDate = new Date(timelineData[0]?.year ?? new Date().getFullYear(), 0, 1);

      // Calculate the horizontal offset for the feature's start date
      const offset = getOffset(feature.startAt, timelineStartDate, {
        zoom,
        range,
        columnWidth,
        sidebarWidth,
        headerHeight,
        rowHeight,
        placeholderLength: 2,
        timelineData,
        ref: scrollRef,
      });

      // Scroll to align the feature's start with the right side of the sidebar
      const targetScrollLeft = Math.max(0, offset);

      scrollElement.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth',
      });
    },
    [timelineData, zoom, range, columnWidth, sidebarWidth],
  );

  const contextValue = useMemo(
    () => ({
      zoom,
      range,
      headerHeight,
      columnWidth,
      sidebarWidth,
      rowHeight,
      timelineData,
      placeholderLength: 2,
      ref: scrollRef,
      scrollToFeature,
    }),
    [zoom, range, columnWidth, sidebarWidth, timelineData, scrollToFeature],
  );

  return (
    <GanttContext.Provider value={contextValue}>
      <div
        className={cn(
          'gantt relative isolate grid h-full w-full flex-none select-none overflow-x-auto overflow-y-hidden rounded-sm bg-secondary',
          range,
          className,
        )}
        ref={scrollRef}
        style={{
          ...cssVariables,
          gridTemplateColumns: 'var(--gantt-sidebar-width) 1fr',
        }}
      >
        {children}
      </div>
    </GanttContext.Provider>
  );
};

export type GanttTimelineProps = {
  children: ReactNode;
  className?: string;
};

export const GanttTimeline: FC<GanttTimelineProps> = ({ children, className }) => (
  <div className={cn('relative flex h-full w-max flex-none overflow-clip', className)}>{children}</div>
);

export type GanttTodayProps = {
  className?: string;
};

export const GanttToday: FC<GanttTodayProps> = ({ className }) => {
  const label = 'Today';
  const date = useMemo(() => new Date(), []);
  const gantt = useContext(GanttContext);
  const differenceIn = useMemo(() => getDifferenceIn(gantt.range), [gantt.range]);
  const timelineStartDate = useMemo(() => new Date(gantt.timelineData.at(0)?.year ?? 0, 0, 1), [gantt.timelineData]);

  // Memoize expensive calculations
  const offset = useMemo(() => differenceIn(date, timelineStartDate), [differenceIn, date, timelineStartDate]);
  const innerOffset = useMemo(
    () => calculateInnerOffset(date, gantt.range, (gantt.columnWidth * gantt.zoom) / 100),
    [date, gantt.range, gantt.columnWidth, gantt.zoom],
  );

  return (
    <div
      className="pointer-events-none absolute top-0 left-0 z-20 flex h-full select-none flex-col items-center justify-center overflow-visible"
      style={{
        width: 0,
        transform: `translateX(calc(var(--gantt-column-width) * ${offset} + ${innerOffset}px))`,
      }}
    >
      <div
        className={cn(
          'group pointer-events-auto sticky top-0 flex select-auto flex-col flex-nowrap items-center justify-center whitespace-nowrap rounded-b-md bg-card px-2 py-1 text-foreground text-xs',
          className,
        )}
      >
        {label}
        <span className="max-h-[0] overflow-hidden opacity-80 transition-all group-hover:max-h-[2rem]">
          {formatDate(date, 'MMM dd, yyyy')}
        </span>
      </div>
      <div className={cn('h-full w-px bg-card', className)} />
    </div>
  );
};
