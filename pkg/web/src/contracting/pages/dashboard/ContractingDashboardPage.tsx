import { DashboardWidgetCard } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { filterDashboardWidgets } from '@/components/common/dashboard/dashboard-widget-types.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useAccess } from '@/hooks/use-access.js';

import { contractingDashboardWidgets } from './dashboard-widgets.js';

export function ContractingDashboardPage() {
  const access = useAccess();
  const visibleWidgets = filterDashboardWidgets(access.data, contractingDashboardWidgets);
  return (
    <PageLayout title="Dashboard">
      {access.data && visibleWidgets.length === 0 ? (
        <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center">
          <p className="text-center text-muted-foreground">
            Nothing to show here. Field work happens in the Jedidiah Contracting phone app.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
          {visibleWidgets.map((widget) => (
            <DashboardWidgetCard key={widget.id} size={widget.size} title={widget.title}>
              <widget.Component />
            </DashboardWidgetCard>
          ))}
        </div>
      )}
    </PageLayout>
  );
}
