import { createFileRoute } from '@tanstack/react-router';
import { ImplementsPage } from '@/contracting/pages/fleet/ImplementsPage.js';
export const Route = createFileRoute('/_authed/contracting/fleet/implements/')({
  component: ImplementsPage,
  staticData: { pageLabel: 'Implements' },
});
