import { formatCurrency } from '@pkg/domain';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { SortableCardList } from '@/components/sortable/SortableCardList.js';
import { useOptimisticOrder } from '@/components/sortable/use-optimistic-order.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { CardDescription, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { RateCreateValues, type RateFormValues, rateBasisOptions, toRateInput } from './types.js';

const description =
  "The named Rates Pricing picks per Assignment — time rates bill hours, measure rates bill a Measure Type's quantity. Drag to set the order the picker shows.";

export function RatesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const canEdit = useCan('contracting_rate:update').can;
  const { invalidateRateCard } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const ratesQuery = useQuery(trpc.contractingRateCard.rates.list.queryOptions());
  const measureTypesQuery = useQuery(trpc.contractingRateCard.measureTypes.list.queryOptions());
  const reorder = useMutation(
    trpc.contractingRateCard.rates.reorder.mutationOptions({
      onSuccess: invalidateRateCard,
      onError: (error) => showError(error, 'Unable to reorder Rates.'),
    }),
  );
  const order = useOptimisticOrder(ratesQuery.data, (orderedIds) => reorder.mutateAsync({ orderedIds }));
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingRateCard.rates.create.mutationOptions(),
    errorMessage: 'Unable to create Rate.',
    invalidate: invalidateRateCard,
    navigateTo: (rate) => ({ to: '/contracting/rates/$id/edit', params: { id: rate.id } }),
  });
  const measureTypeOptions = (measureTypesQuery.data ?? []).map((row) => ({ value: row.id, label: row.name }));

  if (ratesQuery.isPending)
    return (
      <PageLayout description={description} size="lg" title="Rate Card">
        <Skeleton className="h-24" />
      </PageLayout>
    );

  return (
    <>
      <PageLayout
        actions={
          canEdit ? (
            <Button onClick={flow.open}>
              <IconPlus data-icon="inline-start" /> New rate
            </Button>
          ) : undefined
        }
        description={description}
        size="lg"
        title="Rate Card"
      >
        <ErrorMessage error={ratesQuery.error} fallbackMessage="Unable to load the Rate Card." />
        <SortableCardList
          order={order}
          canReorder={canEdit}
          label={(rate) => rate.name}
          onOpen={(rate) => void navigate({ to: '/contracting/rates/$id/edit', params: { id: rate.id } })}
          headerClassName="grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
          emptyMessage="No Rates yet."
        >
          {(rate, grip) => (
            <>
              {grip ?? <span />}
              <div className="min-w-0">
                <CardTitle className="truncate">{rate.name}</CardTitle>
                <CardDescription>
                  {rate.basis === 'time' ? 'Per hour' : `Per ${rate.measureTypeName ?? 'measure'}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-3">
                {!rate.active ? <Badge variant="secondary">Inactive</Badge> : null}
                <span className="font-medium tabular-nums">{formatCurrency(rate.amount)}</span>
              </div>
            </>
          )}
        </SortableCardList>
      </PageLayout>
      <CreateEntityDialog
        {...flow.dialogProps}
        defaultValues={{ name: '', basis: 'time', measureTypeId: '', amount: 0 } satisfies RateFormValues}
        description="Add a named time or Measure-based Rate to the card."
        disableSubmitWhenInvalid
        onCreate={(values) => flow.create(toRateInput(values))}
        title="New rate"
        validator={RateCreateValues}
      >
        {(form) => (
          <>
            <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
            <form.AppField name="basis">
              {(field) => (
                <field.SelectField
                  label="Basis"
                  options={rateBasisOptions}
                  onValueCommit={(value) => {
                    if (value === 'time') form.setFieldValue('measureTypeId', '');
                  }}
                />
              )}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.basis}>
              {(basis) =>
                basis === 'measure' ? (
                  <form.AppField name="measureTypeId">
                    {(field) => (
                      <field.SelectField
                        label="Measure type"
                        options={measureTypeOptions}
                        placeholder={
                          measureTypeOptions.length === 0
                            ? 'No measure types yet — add one under Measure Types'
                            : 'Select…'
                        }
                      />
                    )}
                  </form.AppField>
                ) : null
              }
            </form.Subscribe>
            <form.AppField name="amount">
              {(field) => <field.CurrencyField currencyCode="ZAR" label="Amount" />}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
}
