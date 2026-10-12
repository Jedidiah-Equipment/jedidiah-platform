import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { z } from 'zod';
import { InvoicingPage } from '@/contracting/pages/invoicing/InvoicingPage.js';
import { invoicingStages } from '@/contracting/pages/invoicing/types.js';

export const Route = createFileRoute('/_authed/contracting/invoicing/')({
  /** `stage` arrives from the Dashboard once; the page applies it to the saved filters and clears it. */
  validateSearch: z.object({ stage: z.enum(invoicingStages).optional() }),
  component: InvoicingRoute,
  staticData: { pageLabel: 'Invoicing' },
});

function InvoicingRoute() {
  const { stage } = Route.useSearch();
  const navigate = Route.useNavigate();
  const clearStage = useCallback(() => void navigate({ search: {}, replace: true }), [navigate]);
  return <InvoicingPage stage={stage} onStageApplied={clearStage} />;
}
