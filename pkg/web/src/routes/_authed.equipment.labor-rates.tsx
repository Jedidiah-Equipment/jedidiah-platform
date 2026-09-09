import { createFileRoute } from '@tanstack/react-router';
import { LaborRatesPage } from '@/equipment/pages/labor-rates/LaborRatesPage.js';
export const Route = createFileRoute('/_authed/equipment/labor-rates')({
  staticData: { pageLabel: 'Labor rates' },
  component: LaborRatesPage,
});
