import { createFileRoute } from '@tanstack/react-router';
import { InvoicingPage } from '@/contracting/pages/invoicing/InvoicingPage.js';

export const Route = createFileRoute('/_authed/contracting/invoicing/')({
  component: InvoicingPage,
  staticData: { pageLabel: 'Invoicing' },
});
