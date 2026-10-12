import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ReportsPage, type ReportsSearch, reportTabs } from '@/contracting/pages/reports/ReportsPage.js';

const ReportsSearchSchema = z.object({
  tab: z.enum(reportTabs).optional(),
  /** `2026-10` | `2026-Q4` | `2026`, read by `parseReportWindowParam`. */
  window: z.string().optional(),
  /** `category:<uuid>` | `machine:<uuid>`; absent is the fleet. */
  subject: z.string().optional(),
});

export const Route = createFileRoute('/_authed/contracting/reports/')({
  validateSearch: ReportsSearchSchema,
  component: ReportsRoute,
  staticData: { pageLabel: 'Reports' },
});

function ReportsRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ReportsPage
      search={search}
      onSearchChange={(next: ReportsSearch) =>
        void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
      }
    />
  );
}
