import { formatDate, formatHours } from '@pkg/domain';
import { busiestDailyHours, type DailyHoursLevel, dailyHoursLevel, dailyHoursLevels } from '@pkg/domain/contracting';
import type { DailyHoursDay, HoursHeatMapInput } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { type HeatMapColumn, heatMapColumns } from './heat-map-columns.js';

/** Level 0 is the empty cell; the rest step the chart colour up from faint to full. */
const levelClassNames = {
  0: 'bg-muted',
  1: 'bg-chart-1/25',
  2: 'bg-chart-1/50',
  3: 'bg-chart-1/75',
  4: 'bg-chart-1',
} as const satisfies Record<DailyHoursLevel, string>;

const cellClassName = 'size-3 rounded-[3px]';
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
        <span aria-hidden="true" className={cn(cellClassName, levelClassNames[level])} key={level} />
      ))}
      More
    </div>
  );
}

function Grid({ columns, busiestHours }: { columns: HeatMapColumn[]; busiestHours: number }) {
  return (
    <div className="flex gap-2">
      <div className="mt-[18px] grid grid-rows-7 gap-[3px] text-muted-foreground text-xs leading-3">
        {weekdayLabels.map((label, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: seven fixed weekday rows
          <span key={index}>{label}</span>
        ))}
      </div>
      <div className="grid grid-flow-col gap-[3px]">
        {columns.map((column) => (
          <div className="grid gap-[3px]" key={column.days.find(Boolean)?.date}>
            <span className="h-3 whitespace-nowrap text-muted-foreground text-xs leading-3">
              {column.labelDate ? formatDate(column.labelDate, 'monthAbbr') : null}
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
 * columns. With no filter it is the whole fleet; the range defaults to the last six months.
 */
export function HoursHeatMap(input: HoursHeatMapInput) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingReports.hoursHeatMap.queryOptions(input));
  if (query.error) return <ErrorMessage error={query.error} fallbackMessage="Unable to load the daily hours." />;
  if (!query.data) return <Skeleton className="h-32 w-full" />;
  const { days } = query.data;
  const busiestHours = busiestDailyHours(days);
  return (
    <div className="grid gap-2">
      <div className="overflow-x-auto pb-1">
        <Grid busiestHours={busiestHours} columns={heatMapColumns(days)} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{busiestHours === 0 ? 'No hours recorded' : null}</span>
        <Legend />
      </div>
    </div>
  );
}
