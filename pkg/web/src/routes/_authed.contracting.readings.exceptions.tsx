import { createFileRoute } from '@tanstack/react-router';
import { ReadingExceptionsPage } from '@/contracting/pages/readings/ReadingExceptionsPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';
export const Route = createFileRoute('/_authed/contracting/readings/exceptions')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_reading:update'),
  component: ReadingExceptionsPage,
  staticData: { pageLabel: 'Reading exceptions' },
});
