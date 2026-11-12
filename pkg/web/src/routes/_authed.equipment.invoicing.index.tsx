import { invoicingQuoteStages } from '@pkg/schema/equipment';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { focusInvoicingOn, InvoicingPage } from '@/equipment/pages/invoicing/InvoicingPage.js';

export const Route = createFileRoute('/_authed/equipment/invoicing/')({
  /** `stage` arrives from the Dashboard once: written into the saved filters and the URL cleared. */
  validateSearch: z.object({ stage: z.enum(invoicingQuoteStages).optional() }),
  beforeLoad: ({ search, preload }) => {
    // Intent preload runs this on hover; only a committed navigation may touch the saved filters.
    if (preload || !search.stage) return;
    focusInvoicingOn(search.stage);
    throw redirect({ to: '/equipment/invoicing', search: {}, replace: true });
  },
  component: InvoicingPage,
  staticData: { pageLabel: 'Invoicing' },
});
