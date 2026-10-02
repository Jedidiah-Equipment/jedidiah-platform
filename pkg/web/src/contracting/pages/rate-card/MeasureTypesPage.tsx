import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { SortableCardList } from '@/components/sortable/SortableCardList.js';
import { useOptimisticOrder } from '@/components/sortable/use-optimistic-order.js';
import { Button } from '@/components/ui/button.js';
import { CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { MeasureTypeFormValues } from './types.js';

const description =
  'Production units recorded on Assignments at sign-off — hectares, loads, … Drag to set the picker order.';

export function MeasureTypesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canEdit = useCan('contracting_rate:update').can;
  const { invalidateRateCard } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const query = useQuery(trpc.contractingRateCard.measureTypes.list.queryOptions());
  const reorder = useMutation(
    trpc.contractingRateCard.measureTypes.reorder.mutationOptions({
      onSuccess: invalidateRateCard,
      onError: (error) => showError(error, 'Unable to reorder Measure Types.'),
    }),
  );
  const order = useOptimisticOrder(query.data, (orderedIds) => reorder.mutateAsync({ orderedIds }));
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingRateCard.measureTypes.create.mutationOptions(),
    errorMessage: 'Unable to create Measure Type.',
    invalidate: invalidateRateCard,
    navigateTo: (row) => ({ to: '/contracting/measure-types/$id/edit', params: { id: row.id } }),
  });

  if (query.isPending)
    return (
      <PageLayout description={description} size="lg" title="Measure Types">
        <Skeleton className="h-24" />
      </PageLayout>
    );

  return (
    <>
      <PageLayout
        actions={
          canEdit ? (
            <Button onClick={flow.open}>
              <IconPlus data-icon="inline-start" /> New measure type
            </Button>
          ) : undefined
        }
        description={description}
        size="lg"
        title="Measure Types"
      >
        <ErrorMessage error={query.error} fallbackMessage="Unable to load Measure Types." />
        <SortableCardList
          order={order}
          canReorder={canEdit}
          label={(row) => row.name}
          onOpen={(row) => void navigate({ to: '/contracting/measure-types/$id/edit', params: { id: row.id } })}
          headerClassName="grid-cols-[auto_minmax(0,1fr)] items-center gap-3"
          emptyMessage="No Measure Types yet."
        >
          {(row, grip) => (
            <>
              {grip ?? <span />}
              <CardTitle className="truncate">{row.name}</CardTitle>
            </>
          )}
        </SortableCardList>
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        defaultValues={{ name: '' }}
        onCreate={flow.create}
        title="New measure type"
        validator={MeasureTypeFormValues}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>}
      </CreateEntityDialog>
    </>
  );
}
