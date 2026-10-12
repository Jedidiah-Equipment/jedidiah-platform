import type { ReportWindowInput, UtilisationTrendSubject } from '@pkg/schema/contracting';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { StatCardSkeleton } from '@/components/common/StatCard.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Empty, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { CategoryUtilisationCard } from './CategoryUtilisationCard.js';
import { UtilisationHeadline } from './UtilisationHeadline.js';
import { UtilisationTrendChart } from './UtilisationTrendChart.js';

/** Everything for the window comes from one `utilisation` read; the trend is the only second query. */
export function UtilisationTab({
  window,
  subject,
  onSubjectChange,
}: {
  window: ReportWindowInput;
  subject: UtilisationTrendSubject;
  onSubjectChange: (subject: UtilisationTrendSubject) => void;
}) {
  const trpc = useTRPC();
  const report = useQuery(
    trpc.contractingReports.utilisation.queryOptions(window, { placeholderData: keepPreviousData }),
  );
  const trend = useQuery(trpc.contractingReports.utilisationTrend.queryOptions({ window, subject }));

  if (report.isPending)
    return (
      <div className="grid gap-4">
        <Card>
          <CardContent className="flex gap-6">
            <StatCardSkeleton />
            <StatCardSkeleton />
          </CardContent>
        </Card>
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  if (report.error)
    return <ErrorMessage error={report.error} fallbackMessage="Unable to load the Utilisation report." />;
  const { fleet, categories, utilisationTargetPercent } = report.data;
  if (fleet.fleetDays === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyIcon />
          <EmptyTitle>No fleet in this period</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="grid gap-4">
      <UtilisationHeadline fleet={fleet} target={utilisationTargetPercent} />
      <Card>
        <CardHeader>
          <CardTitle>Utilisation % by month · {trend.data?.label ?? '…'}</CardTitle>
          {subject.kind === 'fleet' ? null : (
            <CardAction>
              <Button variant="ghost" size="sm" onClick={() => onSubjectChange({ kind: 'fleet' })}>
                Show the fleet
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {trend.error ? (
            <ErrorMessage error={trend.error} fallbackMessage="Unable to load the trend." />
          ) : trend.data ? (
            <UtilisationTrendChart trend={trend.data} />
          ) : (
            <Skeleton className="h-64 w-full" />
          )}
        </CardContent>
      </Card>
      {categories.map((category) => (
        <CategoryUtilisationCard
          key={category.categoryId}
          category={category}
          subject={subject}
          onSubjectChange={onSubjectChange}
        />
      ))}
    </div>
  );
}
