import { hasBusinessAccess } from '@pkg/domain';
import { createFileRoute, redirect } from '@tanstack/react-router';

import { getRouteAccess, getRouteSession } from '@/lib/route-auth.js';

export const Route = createFileRoute('/')({
  beforeLoad: async ({ context }) => {
    const session = await getRouteSession(context);

    throw redirect({
      to: session
        ? hasBusinessAccess(await getRouteAccess(context), 'equipment')
          ? '/equipment/dashboard'
          : '/contracting'
        : '/login',
    });
  },
});
