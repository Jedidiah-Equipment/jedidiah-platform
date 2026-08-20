import { useQuery } from '@tanstack/react-query';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

import { CloseOutQueueTable } from './components/CloseOutQueueTable.js';

export function CloseOutQueuePage() {
  const trpc = useTRPC();
  const queueQuery = useQuery(trpc.inventory.closeOutQueue.queryOptions());

  return (
    <PageLayout
      description="Completed Jobs still holding drawn stock or open commitment. A Job leaves only once it is closed out."
      title="Close-out queue"
    >
      <CloseOutQueueTable
        errorMessage={getApiQueryErrorMessage(queueQuery.error, 'Unable to load the close-out queue.')}
        isLoading={queueQuery.isPending}
        items={queueQuery.data?.items ?? []}
      />
    </PageLayout>
  );
}
