import { DashboardRowGrid } from '@/components/common/dashboard/DashboardRowGrid.js';
import { visibleDashboardRows } from '@/components/common/dashboard/dashboard-rows.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useAccess } from '@/hooks/use-access.js';

import { contractingDashboardRows } from './dashboard-widgets.js';

export function ContractingDashboardPage() {
  const access = useAccess();
  const rows = visibleDashboardRows(access.data, contractingDashboardRows);
  return (
    <PageLayout title="Dashboard">
      {access.data && rows.length === 0 ? (
        <div className="flex min-h-[calc(100svh-12rem)] items-center justify-center">
          <p className="text-center text-muted-foreground">
            Nothing to show here. Field work happens in the Jedidiah Contracting phone app.
          </p>
        </div>
      ) : (
        <DashboardRowGrid rows={rows} />
      )}
    </PageLayout>
  );
}
