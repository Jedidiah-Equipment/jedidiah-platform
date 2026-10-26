import { createFileRoute } from '@tanstack/react-router';
import { useCallback } from 'react';
import { SettingsPage } from '@/contracting/pages/settings/SettingsPage.js';
import { SettingsSearch } from '@/contracting/pages/settings/settings-tabs.js';
import { requireRoutePermission } from '@/lib/route-auth.js';

export const Route = createFileRoute('/_authed/contracting/settings')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_settings:update'),
  validateSearch: SettingsSearch,
  component: SettingsRoute,
  staticData: { pageLabel: 'Settings' },
});

function SettingsRoute() {
  const { tab, result } = Route.useSearch();
  const navigate = Route.useNavigate();
  const dropResult = useCallback(() => void navigate({ search: { tab }, replace: true }), [navigate, tab]);
  return (
    <SettingsPage
      tab={tab}
      onTabChange={(nextTab) => void navigate({ search: { tab: nextTab } })}
      result={result}
      onResultShown={dropResult}
    />
  );
}
