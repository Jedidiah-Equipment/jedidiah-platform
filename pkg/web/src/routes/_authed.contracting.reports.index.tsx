import { createFileRoute } from '@tanstack/react-router';
import { ReportsPage } from '@/contracting/pages/reports/ReportsPage.js';
import { ReportsSearch } from '@/contracting/pages/reports/report-search.js';

export const Route = createFileRoute('/_authed/contracting/reports/')({
  validateSearch: ReportsSearch,
  component: ReportsRoute,
  staticData: { pageLabel: 'Reports' },
});

function ReportsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ReportsPage
      search={search}
      onSearchChange={(next) => void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })}
    />
  );
}
