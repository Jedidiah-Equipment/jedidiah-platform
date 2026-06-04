import type React from 'react';

import { useAccess } from '@/hooks/use-access.js';

import { DashboardWidgetCard } from './DashboardWidgetCard.js';
import { filterDashboardWidgets } from './dashboard-widget-types.js';
import { dashboardWidgets } from './dashboard-widgets.js';

type DashboardPageProps = Record<string, never>;

export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const accessQuery = useAccess();
  const visibleWidgets = filterDashboardWidgets(accessQuery.data, dashboardWidgets);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {visibleWidgets.map((widget) => (
          <DashboardWidgetCard key={widget.id} size={widget.size} title={widget.title}>
            <widget.Component />
          </DashboardWidgetCard>
        ))}
      </div>
    </div>
  );
};
