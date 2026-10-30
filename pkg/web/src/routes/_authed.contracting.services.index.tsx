import { createFileRoute } from '@tanstack/react-router';
import { ServicesPage } from '@/contracting/pages/services/ServicesPage.js';

export const Route = createFileRoute('/_authed/contracting/services/')({
  component: ServicesPage,
  staticData: { pageLabel: 'Services' },
});
