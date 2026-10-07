import { createFileRoute } from '@tanstack/react-router';
import { WorkshopPage } from '@/contracting/pages/workshop/WorkshopPage.js';

export const Route = createFileRoute('/_authed/contracting/workshop/')({
  component: WorkshopPage,
  staticData: { pageLabel: 'Workshop' },
});
