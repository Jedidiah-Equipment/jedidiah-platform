import { activityPermissions } from '@pkg/domain/contracting';
import { createFileRoute } from '@tanstack/react-router';
import { ActivityPage } from '@/contracting/pages/activity/ActivityPage.js';
import { requireAnyRoutePermission } from '@/lib/route-auth.js';

// The same either-of the phone tab and the API use: a Jobs reach or a Workshop reach.
export const Route = createFileRoute('/_authed/contracting/activity')({
  beforeLoad: ({ context }) => requireAnyRoutePermission(context, activityPermissions),
  component: ActivityPage,
  staticData: { pageLabel: 'Activity' },
});
