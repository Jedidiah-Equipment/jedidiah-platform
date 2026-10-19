import { createFileRoute } from '@tanstack/react-router';
import { useEffect } from 'react';
import { z } from 'zod';
import { MachinesPage } from '@/contracting/pages/fleet/MachinesPage.js';
import { serviceFilterValues } from '@/contracting/pages/fleet/types.js';

export const Route = createFileRoute('/_authed/contracting/fleet/')({
  /** `service` arrives from the Dashboard once; the table opens with it and the address drops it. */
  validateSearch: z.object({ service: z.enum(serviceFilterValues).optional() }),
  component: MachinesRoute,
  staticData: { pageLabel: 'Machines' },
});

/**
 * The Machines table is browser-owned, so nothing outside it can be written ahead of the mount the way the saved
 * filters can; the value rides the first render and the address is cleared once the table has it.
 */
function MachinesRoute() {
  const { service } = Route.useSearch();
  const navigate = Route.useNavigate();
  useEffect(() => {
    if (service) void navigate({ search: {}, replace: true });
  }, [navigate, service]);
  return <MachinesPage service={service} />;
}
