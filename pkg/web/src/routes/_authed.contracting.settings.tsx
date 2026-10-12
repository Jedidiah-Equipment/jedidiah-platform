import { createFileRoute } from '@tanstack/react-router';
import { SettingsPage } from '@/contracting/pages/settings/SettingsPage.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/settings')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_settings:update'),
  component: SettingsPage,
  staticData: { pageLabel: 'Settings' },
});
