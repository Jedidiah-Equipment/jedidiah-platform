import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { formatCurrency } from '@pkg/domain';
import type { Rate } from '@pkg/schema/contracting';
import { IconGripVertical, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
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
  const [orderedRates, setOrderedRates] = useState<Rate[]>([]);

  useEffect(() => {
    if (ratesQuery.data) setOrderedRates(ratesQuery.data);
  }, [ratesQuery.data]);

  const reorder = useMutation(
    trpc.contractingRateCard.rates.reorder.mutationOptions({
      onSuccess: invalidateRateCard,
      onError: (error) => {
        if (ratesQuery.data) setOrderedRates(ratesQuery.data);
        showError(error, 'Unable to reorder Rates.');
      },
    }),
  );
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingRateCard.rates.create.mutationOptions(),
    errorMessage: 'Unable to create Rate.',
    invalidate: invalidateRateCard,
    navigateTo: (rate) => ({ to: '/contracting/rates/$id/edit', params: { id: rate.id } }),
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    if (reorder.isPending || !event.over || event.active.id === event.over.id) return;
    const oldIndex = orderedRates.findIndex((rate) => rate.id === event.active.id);
    const newIndex = orderedRates.findIndex((rate) => rate.id === event.over?.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedRates, oldIndex, newIndex);
    setOrderedRates(next);
    reorder.mutate({ orderedIds: next.map((rate) => rate.id) });
  };
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
        {orderedRates.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No Rates yet.
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext items={orderedRates.map((rate) => rate.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {orderedRates.map((rate) => (
                  <SortableRateRow
                    canEdit={canEdit}
                    disabled={reorder.isPending}
                    key={rate.id}
                    onOpen={() => void navigate({ to: '/contracting/rates/$id/edit', params: { id: rate.id } })}
                    rate={rate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
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

function SortableRateRow({
  canEdit,
  disabled,
  onOpen,
  rate,
}: {
  canEdit: boolean;
  disabled: boolean;
  onOpen: () => void;
  rate: Rate;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: rate.id,
    disabled: !canEdit || disabled,
  });
  const basis = rate.basis === 'time' ? 'Per hour' : `Per ${rate.measureTypeName ?? 'measure'}`;
  return (
    <Card
      aria-label={`Open ${rate.name}`}
      className={cn('min-w-0 cursor-pointer', isDragging && 'z-10 opacity-80 shadow-lg')}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen();
        }
      }}
      ref={setNodeRef}
      role="button"
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      tabIndex={0}
    >
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        {canEdit ? (
          <button
            aria-label={`Reorder ${rate.name}`}
            className={cn(
              'touch-none text-muted-foreground',
              disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing',
            )}
            disabled={disabled}
            onClick={(event) => event.stopPropagation()}
            type="button"
            {...attributes}
            {...listeners}
          >
            <IconGripVertical />
          </button>
        ) : (
          <span />
        )}
        <div className="min-w-0">
          <CardTitle className="truncate">{rate.name}</CardTitle>
          <CardDescription>{basis}</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          {!rate.active ? <Badge variant="secondary">Inactive</Badge> : null}
          <span className="font-medium tabular-nums">{formatCurrency(rate.amount, 'ZAR')}</span>
        </div>
      </CardHeader>
    </Card>
  );
}
