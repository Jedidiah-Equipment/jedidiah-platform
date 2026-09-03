import { createFileRoute } from '@tanstack/react-router';

import { PriceVarianceReportPage } from '@/pages/inventory/price-variance/PriceVarianceReportPage.js';

export const Route = createFileRoute('/_authed/equipment/inventory/price-variance')({
  staticData: {
    pageLabel: 'PO vs invoiced',
  },
  component: PriceVarianceReportPage,
});
