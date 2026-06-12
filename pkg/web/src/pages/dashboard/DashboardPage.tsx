import type React from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useAccess } from '@/hooks/use-access.js';

import { DashboardWidgetCard } from './DashboardWidgetCard.js';
import { filterDashboardWidgets } from './dashboard-widget-types.js';
import { dashboardWidgets } from './dashboard-widgets.js';

type DashboardPageProps = Record<string, never>;

export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const accessQuery = useAccess();
  const visibleWidgets = filterDashboardWidgets(accessQuery.data, dashboardWidgets);

  return (
    <PageLayout title="Dashboard">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        {visibleWidgets.map((widget) => (
          <DashboardWidgetCard key={widget.id} size={widget.size} title={widget.title}>
            <widget.Component />
          </DashboardWidgetCard>
        ))}
      </div>
    </PageLayout>
  );
};
