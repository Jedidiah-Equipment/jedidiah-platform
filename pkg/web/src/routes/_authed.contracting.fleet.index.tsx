import { createFileRoute } from '@tanstack/react-router';
import { MachinesPage } from '@/contracting/pages/fleet/MachinesPage.js';
export const Route = createFileRoute('/_authed/contracting/fleet/')({
  component: MachinesPage,
  staticData: { pageLabel: 'Machines' },
});
