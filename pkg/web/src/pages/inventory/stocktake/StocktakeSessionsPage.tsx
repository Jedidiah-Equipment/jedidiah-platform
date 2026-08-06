import { formatDate } from '@pkg/domain';
import { STOCKTAKE_SCOPE_LABELS, type StocktakeOverdueRow } from '@pkg/schema';
import { IconAlertTriangle, IconCircleCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

import { StocktakeSessionsTable } from './components/StocktakeSessionsTable.js';

/**
 * Every walk the plant has made, and whether each standing rhythm is behind.
 *
 * The two rhythms lead the page rather than sitting in a column of the table, because the question
 * this screen is opened with is "are we current?" — the session history is the evidence behind the
 * answer, not the answer itself.
 */
export function StocktakeSessionsPage() {
  const trpc = useTRPC();
  const sessionsQuery = useQuery(trpc.inventory.stocktakeSessions.queryOptions());
  const overdueQuery = useQuery(trpc.inventory.stocktakeOverdue.queryOptions());

  return (
    <PageLayout
      description="Counting walks, their variance, and what each one skipped. Counts are posted from the stores tablet."
      size="lg"
      title="Stocktake"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(overdueQuery.data?.items ?? []).map((row) => (
          <ScopeCadenceAlert key={row.scope} row={row} />
        ))}
      </div>

      <StocktakeSessionsTable
        errorMessage={getApiQueryErrorMessage(sessionsQuery.error, 'Unable to load stocktake sessions.')}
        isLoading={sessionsQuery.isPending}
        items={sessionsQuery.data?.items ?? []}
      />
    </PageLayout>
  );
}

function ScopeCadenceAlert({ row }: { row: StocktakeOverdueRow }) {
  const label = STOCKTAKE_SCOPE_LABELS[row.scope];

  return (
    <Alert variant={row.isOverdue ? 'destructive' : 'default'}>
      {row.isOverdue ? <IconAlertTriangle /> : <IconCircleCheck />}
      <AlertTitle>{`${label} count ${row.isOverdue ? 'is overdue' : 'is up to date'}`}</AlertTitle>
      <AlertDescription>{describeCadence(row)}</AlertDescription>
    </Alert>
  );
}

function describeCadence(row: StocktakeOverdueRow): string {
  if (row.lastClosedOn === null) return 'No session has ever been closed for this scope.';

  const lastCounted = `Last counted ${formatDate(row.lastClosedOn)}`;

  if (!row.isOverdue) return `${lastCounted}. Due by ${formatDate(row.dueBy)}.`;

  return `${lastCounted}. Was due by ${formatDate(row.dueBy)}, ${row.overdueDays === 1 ? '1 day' : `${row.overdueDays} days`} ago.`;
}
