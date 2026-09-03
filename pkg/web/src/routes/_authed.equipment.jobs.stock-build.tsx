import { createFileRoute } from '@tanstack/react-router';

import { StockBuildPage } from '@/pages/jobs/StockBuildPage.js';

export const Route = createFileRoute('/_authed/equipment/jobs/stock-build')({
  staticData: {
    pageLabel: 'New Stock Build',
  },
  component: StockBuildPage,
});
