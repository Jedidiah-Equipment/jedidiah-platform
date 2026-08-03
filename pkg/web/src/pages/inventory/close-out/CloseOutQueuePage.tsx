import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

import { CloseOutQueueTable } from './components/CloseOutQueueTable.js';

export function CloseOutQueuePage() {
  const trpc = useTRPC();
  const queueQuery = useQuery(trpc.inventory.closeOutQueue.queryOptions());

  return (
    <PageLayout
      description="Completed Jobs still holding drawn stock or open commitment. A Job leaves only once it is closed out."
      size="lg"
      title="Close-out queue"
    >
      {queueQuery.isPending ? <CloseOutQueueSkeleton /> : null}
      {queueQuery.error ? <p className="text-destructive text-sm">Unable to load the close-out queue.</p> : null}
      {queueQuery.data?.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No completed Jobs are waiting to be closed out.</p>
      ) : null}
      {queueQuery.data?.items.length ? <CloseOutQueueTable items={queueQuery.data.items} /> : null}
    </PageLayout>
  );
}

function CloseOutQueueSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}
