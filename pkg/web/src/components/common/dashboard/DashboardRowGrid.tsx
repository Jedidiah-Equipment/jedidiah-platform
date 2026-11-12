import type { CSSProperties } from 'react';
import { DashboardWidgetCard } from './DashboardWidgetCard.js';
import { type DashboardRows, dashboardRowColumns } from './dashboard-rows.js';

export function DashboardRowGrid({ rows }: { rows: DashboardRows }) {
  return (
    <div className="flex flex-col gap-4">
      {rows.map((row) => (
        <div
          key={row[0]?.id}
          className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-(--row-columns)"
          style={{ '--row-columns': dashboardRowColumns(row) } as CSSProperties}
        >
          {row.map((widget) => (
            <DashboardWidgetCard className="xl:col-span-1" key={widget.id} size={widget.size} title={widget.title}>
              <widget.Component />
            </DashboardWidgetCard>
          ))}
        </div>
      ))}
    </div>
  );
}
