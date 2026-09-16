import { createFileRoute } from '@tanstack/react-router';
import { RatesPage } from '@/contracting/pages/rate-card/RatesPage.js';
export const Route = createFileRoute('/_authed/contracting/rates/')({
  component: RatesPage,
  staticData: { pageLabel: 'Rate Card' },
});
