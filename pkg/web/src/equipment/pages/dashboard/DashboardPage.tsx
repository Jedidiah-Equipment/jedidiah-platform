import type React from 'react';
import { DashboardRowGrid } from '@/components/common/dashboard/DashboardRowGrid.js';
import { visibleDashboardRows } from '@/components/common/dashboard/dashboard-rows.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useAccess } from '@/hooks/use-access.js';
import { equipmentDashboardRows } from './dashboard-widgets.js';

type DashboardPageProps = Record<string, never>;

export const DashboardPage: React.FC<DashboardPageProps> = () => {
  const accessQuery = useAccess();

  return (
    <PageLayout title="Dashboard">
      <DashboardRowGrid rows={visibleDashboardRows(accessQuery.data, equipmentDashboardRows)} />
    </PageLayout>
  );
};
