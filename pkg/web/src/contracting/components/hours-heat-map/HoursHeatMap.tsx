import { formatDate, formatHours, getPlantDateNow } from '@pkg/domain';
import { busiestDailyHours, type DailyHoursLevel, dailyHoursLevel, dailyHoursLevels } from '@pkg/domain/contracting';
import type { DailyHoursDay, HoursHeatMapInput } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { fitHeatMapWeeks, type HeatMapColumn, heatMapColumns, heatMapStartForWeeks } from './heat-map-columns.js';
import { useElementWidth } from './use-element-width.js';

/** Level 0 is the empty cell; the rest step the primary colour up from faint to full. */
const levelClassNames = {
  0: 'bg-muted',
  1: 'bg-primary/25',
  2: 'bg-primary/50',
  3: 'bg-primary/75',
  4: 'bg-primary',
} as const satisfies Record<DailyHoursLevel, string>;

const swatchClassName = 'size-3 rounded-[3px]';
const cellClassName = 'aspect-square w-full rounded-[3px]';
const weekdayLabels = ['Mon', '', 'Wed', '', 'Fri', '', ''] as const;

function dayDescription(day: DailyHoursDay) {
  return `${formatDate(day.date, 'long')}: ${formatHours(day.hours)}${day.estimated ? ', estimated' : ''}`;
}

function DayCell({ day, busiestHours }: { day: DailyHoursDay; busiestHours: number }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            aria-label={dayDescription(day)}
            className={cn(cellClassName, levelClassNames[dailyHoursLevel(day.hours, busiestHours)])}
            role="img"
          />
        }
      />
      <TooltipContent>
        <span className="grid gap-0.5">
          <span className="font-medium">{formatDate(day.date, 'long')}</span>
          <span>{formatHours(day.hours)}</span>
          {day.estimated ? (
            <span className="opacity-80">Estimated from readings spread across several days</span>
          ) : null}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

function Legend() {
  return (
    <div className="flex items-center justify-end gap-1.5 text-muted-foreground text-xs">
      Less
      {dailyHoursLevels.map((level) => (
        <span aria-hidden="true" className={cn(swatchClassName, levelClassNames[level])} key={level} />
      ))}
      More
    </div>
  );
}

/** The weekday label column and the gap beside it, which the grid never gets. */
const LABELS_WIDTH_PX = 36;

function Grid({ columns, busiestHours }: { columns: HeatMapColumn[]; busiestHours: number }) {
  return (
    <div className="flex gap-2">
      <div className="mt-[18px] grid w-7 shrink-0 grid-rows-7 gap-[3px] text-muted-foreground text-xs leading-3">
        {weekdayLabels.map((label, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: seven fixed weekday rows
          <span key={index}>{label}</span>
        ))}
      </div>
      <div
        className="grid min-w-0 flex-1 gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((column) => (
          <div className="grid grid-cols-1 content-start gap-[3px]" key={column.days.find(Boolean)?.date}>
            {/* The label hangs out of its column so its width never sizes the cells beneath it. */}
            <span className="relative h-3 text-muted-foreground text-xs leading-3">
              <span className="absolute left-0 whitespace-nowrap">
                {column.labelDate ? formatDate(column.labelDate, 'monthAbbr') : null}
              </span>
            </span>
            {column.days.map((day, index) =>
              day ? (
                <DayCell busiestHours={busiestHours} day={day} key={day.date} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: padding slots have no date of their own
                <span aria-hidden="true" className={cn(cellClassName, 'bg-muted/30')} key={index} />
              ),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The Daily Hours of the selected Machines and Jobs as a GitHub-style heat map: one cell per plant day, weeks as
 * columns, the cells sized to fill the width. With no filter it is the whole fleet. With no range named it shows as
 * many whole weeks as fit, between six months and a year, ending at `end` or today; a named `start` is shown as given.
 */
export function HoursHeatMap({ refetchInterval, ...input }: HoursHeatMapInput & { refetchInterval?: number }) {
  const trpc = useTRPC();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const fitting = input.start === undefined;
  const range = fitting
    ? {
        start: heatMapStartForWeeks(fitHeatMapWeeks(width - LABELS_WIDTH_PX), input.end ?? getPlantDateNow()),
      }
    : {};
  const query = useQuery({
    ...trpc.contractingReports.hoursHeatMap.queryOptions({ ...input, ...range }),
    enabled: !fitting || width > 0,
    refetchInterval: refetchInterval ?? false,
  });
  const days = query.data?.days;
  const busiestHours = days ? busiestDailyHours(days) : 0;
  return (
    <div className="grid gap-2" ref={ref}>
      {query.error ? (
        <ErrorMessage error={query.error} fallbackMessage="Unable to load the daily hours." />
      ) : days ? (
        <>
          <Grid busiestHours={busiestHours} columns={heatMapColumns(days)} />
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground text-xs">{busiestHours === 0 ? 'No hours recorded' : null}</span>
            <Legend />
          </div>
        </>
      ) : (
        <Skeleton className="h-32 w-full" />
      )}
    </div>
  );
}
