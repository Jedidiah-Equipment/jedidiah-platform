import { createFileRoute } from '@tanstack/react-router';

import { ContractingDashboardPage } from '@/contracting/pages/dashboard/ContractingDashboardPage.js';

export const Route = createFileRoute('/_authed/contracting/')({
  staticData: {
    pageLabel: 'Dashboard',
  },
  component: ContractingDashboardPage,
});
