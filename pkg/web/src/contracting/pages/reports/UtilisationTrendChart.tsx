import { formatDate, formatNumber, formatPercent } from '@pkg/domain';
import type { UtilisationTrend, UtilisationTrendPoint } from '@pkg/schema/contracting';
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart.js';

const chartConfig = {
  utilisationPercent: { label: 'Utilisation', color: 'var(--chart-1)' },
} satisfies ChartConfig;

/** `Oct`, with the year on the first bar and every January: the month name always comes from `formatDate`. */
function monthTick(month: string, index: number): string {
  const name = formatDate(`${month}-01`, 'month');
  const short = name.slice(0, 3);
  return index === 0 || month.endsWith('-01') ? `${short} ${month.slice(0, 4)}` : short;
}

function TrendTooltip({ active, payload }: { active?: boolean; payload?: { payload: UtilisationTrendPoint }[] }) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="grid gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium">{formatDate(`${point.month}-01`, 'month')}</span>
      <span>{point.utilisationPercent === null ? 'Not in the fleet' : formatPercent(point.utilisationPercent)}</span>
      <span className="text-muted-foreground">
        {formatNumber(point.activeDays)} active days of {formatNumber(point.fleetDays)}
      </span>
    </div>
  );
}

/** Twelve months of Utilisation % for one subject, with the Settings target as a dashed line when it is set. */
export function UtilisationTrendChart({ trend }: { trend: UtilisationTrend }) {
  const target = trend.utilisationTargetPercent;
  return (
    <ChartContainer config={chartConfig} className="h-64 w-full">
      <BarChart
        accessibilityLayer
        aria-label={trend.months
          .map(
            (point) =>
              `${formatDate(`${point.month}-01`, 'month')}: ${
                point.utilisationPercent === null ? 'not in the fleet' : formatPercent(point.utilisationPercent)
              }`,
          )
          .join('; ')}
        data={trend.months}
        margin={{ left: 0, right: 8, top: 8, bottom: 0 }}
      >
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="month"
          interval={0}
          tickLine={false}
          axisLine={false}
          tickFormatter={(month: string, index: number) => monthTick(month, index)}
        />
        <YAxis
          domain={[0, 100]}
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(value: number) => formatPercent(value)}
        />
        <ChartTooltip content={<TrendTooltip />} />
        <Bar dataKey="utilisationPercent" fill="var(--color-utilisationPercent)" radius={[2, 2, 0, 0]} />
        {target === null ? null : (
          <ReferenceLine y={target} stroke="var(--chart-2)" strokeDasharray="4 4" label="Target" />
        )}
      </BarChart>
    </ChartContainer>
  );
}
