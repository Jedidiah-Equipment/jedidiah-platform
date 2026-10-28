import type { CSSProperties } from 'react';
import { DashboardWidgetCard } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useAccess } from '@/hooks/use-access.js';

import { dashboardRowColumns, visibleContractingDashboardRows } from './dashboard-widgets.js';

export function ContractingDashboardPage() {
  const access = useAccess();
  const rows = visibleContractingDashboardRows(access.data);
  return (
    <PageLayout title="Dashboard">
      {access.data && rows.length === 0 ? (
        <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center">
          <p className="text-center text-muted-foreground">
            Nothing to show here. Field work happens in the Jedidiah Contracting phone app.
          </p>
        </div>
      ) : (
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
      )}
    </PageLayout>
  );
}
