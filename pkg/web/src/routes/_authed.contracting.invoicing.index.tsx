import { createFileRoute } from '@tanstack/react-router';
import { InvoicingPage } from '@/contracting/pages/invoicing/InvoicingPage.js';
import { InvoicingSearch } from '@/contracting/pages/invoicing/types.js';

export const Route = createFileRoute('/_authed/contracting/invoicing/')({
  validateSearch: InvoicingSearch,
  component: InvoicingRoute,
  staticData: { pageLabel: 'Invoicing' },
});

function InvoicingRoute() {
  const { tab, month } = Route.useSearch();
  return <InvoicingPage tab={tab} month={month} />;
}
