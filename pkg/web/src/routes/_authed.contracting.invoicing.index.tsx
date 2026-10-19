import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { focusInvoicingOn, InvoicingPage } from '@/contracting/pages/invoicing/InvoicingPage.js';
import { invoicingStages } from '@/contracting/pages/invoicing/types.js';

export const Route = createFileRoute('/_authed/contracting/invoicing/')({
  /** `stage` arrives from the Dashboard once: written into the saved filters and the URL cleared. */
  validateSearch: z.object({ stage: z.enum(invoicingStages).optional() }),
  beforeLoad: ({ search, preload }) => {
    // Intent preload runs this on hover; only a committed navigation may touch the saved filters.
    if (preload || !search.stage) return;
    focusInvoicingOn(search.stage);
    throw redirect({ to: '/contracting/invoicing', search: {}, replace: true });
  },
  component: InvoicingPage,
  staticData: { pageLabel: 'Invoicing' },
});
