import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { MeasureType } from '@pkg/schema/contracting';
import { IconGripVertical, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
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
  const [orderedRows, setOrderedRows] = useState<MeasureType[]>([]);
  useEffect(() => {
    if (query.data) setOrderedRows(query.data);
  }, [query.data]);
  const reorder = useMutation(
    trpc.contractingRateCard.measureTypes.reorder.mutationOptions({
      onSuccess: invalidateRateCard,
      onError: (error) => {
        if (query.data) setOrderedRows(query.data);
        showError(error, 'Unable to reorder Measure Types.');
      },
    }),
  );
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingRateCard.measureTypes.create.mutationOptions(),
    errorMessage: 'Unable to create Measure Type.',
    invalidate: invalidateRateCard,
    navigateTo: (row) => ({ to: '/contracting/measure-types/$id/edit', params: { id: row.id } }),
  });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const handleDragEnd = (event: DragEndEvent) => {
    if (reorder.isPending || !event.over || event.active.id === event.over.id) return;
    const oldIndex = orderedRows.findIndex((row) => row.id === event.active.id);
    const newIndex = orderedRows.findIndex((row) => row.id === event.over?.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(orderedRows, oldIndex, newIndex);
    setOrderedRows(next);
    reorder.mutate({ orderedIds: next.map((row) => row.id) });
  };

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
        {orderedRows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No Measure Types yet.
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext items={orderedRows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {orderedRows.map((row) => (
                  <SortableMeasureTypeRow
                    canEdit={canEdit}
                    disabled={reorder.isPending}
                    key={row.id}
                    measureType={row}
                    onOpen={() => void navigate({ to: '/contracting/measure-types/$id/edit', params: { id: row.id } })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
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

function SortableMeasureTypeRow({
  canEdit,
  disabled,
  measureType,
  onOpen,
}: {
  canEdit: boolean;
  disabled: boolean;
  measureType: MeasureType;
  onOpen: () => void;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: measureType.id,
    disabled: !canEdit || disabled,
  });
  return (
    <Card
      aria-label={`Open ${measureType.name}`}
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
      <CardHeader className="grid-cols-[auto_minmax(0,1fr)] items-center gap-3">
        {canEdit ? (
          <button
            aria-label={`Reorder ${measureType.name}`}
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
        <CardTitle className="truncate">{measureType.name}</CardTitle>
      </CardHeader>
    </Card>
  );
}
