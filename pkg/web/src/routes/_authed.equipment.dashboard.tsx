import { createFileRoute } from '@tanstack/react-router';

import { DashboardPage } from '@/pages/dashboard/DashboardPage.js';

export const Route = createFileRoute('/_authed/equipment/dashboard')({
  staticData: {
    pageLabel: 'Dashboard',
  },
  component: DashboardPage,
});
