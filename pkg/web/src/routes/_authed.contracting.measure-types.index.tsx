import { createFileRoute } from '@tanstack/react-router';
import { MeasureTypesPage } from '@/contracting/pages/rate-card/MeasureTypesPage.js';
export const Route = createFileRoute('/_authed/contracting/measure-types/')({
  component: MeasureTypesPage,
  staticData: { pageLabel: 'Measure Types' },
});
