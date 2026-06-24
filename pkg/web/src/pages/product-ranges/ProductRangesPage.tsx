import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { hasPermission } from '@pkg/domain';
import type { ProductRange } from '@pkg/schema';
import { IconGripVertical, IconLoader2, IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { productRangesPageDescription } from '@/utils/page-descriptions.js';
import { RangeThumbnail } from './components/RangeThumbnail.js';
import { ProductRangeFormValues, toProductRangeCreateInput } from './components/types.js';

export const ProductRangesPage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const canCreateRanges = hasPermission(access, 'product_range:create');
  const canUpdateRanges = hasPermission(access, 'product_range:update');

  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();

  const rangesQuery = useQuery(trpc.productRanges.list.queryOptions());

  const [isCreateOpen, setCreateOpen] = useState(false);

  // Local copy of the list so a drag reorders the cards immediately; it resyncs whenever the query
  // returns (initial load, invalidation after a successful reorder, or a create).
  const [orderedRanges, setOrderedRanges] = useState<ProductRange[]>([]);
  useEffect(() => {
    if (rangesQuery.data) {
      setOrderedRanges(rangesQuery.data.ranges);
    }
  }, [rangesQuery.data]);

  const reorderMutation = useMutation(
    trpc.productRanges.reorder.mutationOptions({
      onSuccess: () => invalidateProductRanges(),
      onError: (error) => {
        // Roll back to the server order on failure.
        if (rangesQuery.data) {
          setOrderedRanges(rangesQuery.data.ranges);
        }
        showMutationError(error, 'Unable to reorder Product Ranges.');
      },
    }),
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    // Ignore drops while a reorder is still in flight: the server treats each payload as authoritative, so
    // overlapping requests could land out of order and persist a stale sequence. Dragging is also disabled
    // below while pending; this is the matching guard.
    if (reorderMutation.isPending) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = orderedRanges.findIndex((range) => range.id === active.id);
    const newIndex = orderedRanges.findIndex((range) => range.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const next = arrayMove(orderedRanges, oldIndex, newIndex);
    setOrderedRanges(next);
    reorderMutation.mutate({ orderedIds: next.map((range) => range.id) });
  };

  if (rangesQuery.isLoading) {
    return (
      <PageLayout description={productRangesPageDescription} size="lg" title="Product Ranges">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </PageLayout>
    );
  }

  if (rangesQuery.error) {
    return (
      <PageLayout description={productRangesPageDescription} size="lg" title="Product Ranges">
        <ErrorMessage error={rangesQuery.error} fallbackMessage="Unable to load Product Ranges." />
      </PageLayout>
    );
  }

  return (
    <>
      <PageLayout
        actions={
          canCreateRanges ? (
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus data-icon="inline-start" />
              New Range
            </Button>
          ) : null
        }
        description={productRangesPageDescription}
        size="lg"
        title="Product Ranges"
      >
        {orderedRanges.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No Product Ranges yet.
          </div>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext items={orderedRanges.map((range) => range.id)} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {orderedRanges.map((range) => (
                  <SortableRangeCard
                    canReorder={canUpdateRanges}
                    canUpdate={canUpdateRanges}
                    dragDisabled={reorderMutation.isPending}
                    key={range.id}
                    onEdit={() => navigate({ to: '/product-ranges/$id/edit', params: { id: range.id } })}
                    range={range}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </PageLayout>

      <CreateProductRangeDialog onClose={() => setCreateOpen(false)} open={isCreateOpen} />
    </>
  );
};

type SortableRangeCardProps = {
  canReorder: boolean;
  canUpdate: boolean;
  dragDisabled: boolean;
  onEdit: () => void;
  range: ProductRange;
};

const SortableRangeCard: React.FC<SortableRangeCardProps> = ({
  canReorder,
  canUpdate,
  dragDisabled,
  onEdit,
  range,
}) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: range.id,
    // Block new drags while a reorder request is in flight so overlapping reorders can't race.
    disabled: !canReorder || dragDisabled,
  });

  return (
    <Card
      className={cn('min-w-0', isDragging && 'z-10 opacity-80 shadow-lg')}
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
    >
      <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] gap-0">
        <div className="flex min-w-0 items-center gap-3">
          {canReorder ? (
            <button
              aria-label={`Reorder ${range.name}`}
              className={cn(
                'touch-none text-muted-foreground',
                dragDisabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing',
              )}
              disabled={dragDisabled}
              type="button"
              {...attributes}
              {...listeners}
            >
              <IconGripVertical />
            </button>
          ) : null}
          <RangeThumbnail image={range.image} name={range.name} rangeId={range.id} />
          <div className="min-w-0 space-y-0.5">
            <CardTitle className="truncate">{range.name}</CardTitle>
            <CardDescription>{range.image ? 'Image attached' : 'No image'}</CardDescription>
          </div>
        </div>
        {canUpdate ? (
          <CardAction span="header">
            <Button aria-label={`Edit ${range.name}`} onClick={onEdit} size="icon-sm" type="button" variant="ghost">
              <IconPencil />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
    </Card>
  );
};

type CreateProductRangeDialogProps = {
  open: boolean;
  onClose: () => void;
};

const CreateProductRangeDialog: React.FC<CreateProductRangeDialogProps> = ({ open, onClose }) => (
  <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>New Product Range</DialogTitle>
        <DialogDescription>Create an admin-managed catalog Range. Add an image on the next screen.</DialogDescription>
      </DialogHeader>
      {open ? <CreateProductRangeForm onClose={onClose} /> : null}
    </DialogContent>
  </Dialog>
);

type CreateProductRangeFormProps = {
  onClose: () => void;
};

// Create is name-only: the Range row must exist before its image can be replaced in place, so the dialog
// creates the Range and then navigates to the edit page where the image is uploaded.
const CreateProductRangeForm: React.FC<CreateProductRangeFormProps> = ({ onClose }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();

  const createMutation = useMutation(
    trpc.productRanges.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Product Range.'),
    }),
  );

  const form = useAppForm({
    defaultValues: { name: '', description: '' } satisfies ProductRangeFormValues,
    validators: { onSubmit: ProductRangeFormValues },
    onSubmit: async ({ value }) => {
      const created = await createMutation.mutateAsync(toProductRangeCreateInput(value));
      await invalidateProductRanges();
      onClose();
      toast.success('Product Range created');
      await navigate({ to: '/product-ranges/$id/edit', params: { id: created.id } });
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
        <form.AppField name="description">
          {(field) => (
            <field.TextareaField
              label="Description"
              placeholder="Short marketing blurb shown on the public site."
              rows={4}
            />
          )}
        </form.AppField>
      </FieldGroup>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <DialogFooter className="mt-4">
            <Button disabled={isSubmitting} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Create
            </Button>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
};
