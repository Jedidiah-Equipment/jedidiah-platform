import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { ProductRange, ProductRangeVariant } from '@pkg/schema';
import { IconGripVertical, IconLoader2, IconPlus, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Empty, EmptyDescription, EmptyHeader, EmptyIcon, EmptyTitle } from '@/components/ui/empty.js';
import { Input } from '@/components/ui/input.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

type ProductRangeVariantsEditorProps = {
  canEdit: boolean;
  range: ProductRange;
};

export const ProductRangeVariantsEditor: React.FC<ProductRangeVariantsEditorProps> = ({ canEdit, range }) => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();
  const [newName, setNewName] = useState('');
  const [orderedVariants, setOrderedVariants] = useState<ProductRangeVariant[]>(range.variants);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    setOrderedVariants(range.variants);
  }, [range.variants]);

  const createMutation = useMutation(
    trpc.productRanges.createVariant.mutationOptions({
      onSuccess: async () => {
        setNewName('');
        await invalidateProductRanges();
        toast.success('Variant added');
      },
      onError: (error) => showMutationError(error, 'Unable to add Variant.'),
    }),
  );
  const updateMutation = useMutation(
    trpc.productRanges.updateVariant.mutationOptions({
      onSuccess: () => invalidateProductRanges(),
      onError: (error) => showMutationError(error, 'Unable to rename Variant.'),
    }),
  );
  const removeMutation = useMutation(
    trpc.productRanges.removeVariant.mutationOptions({
      onSuccess: async () => {
        await invalidateProductRanges();
        toast.success('Variant removed');
      },
      onError: (error) => showMutationError(error, 'Unable to remove Variant.'),
    }),
  );
  const reorderMutation = useMutation(
    trpc.productRanges.reorderVariants.mutationOptions({
      onSuccess: () => invalidateProductRanges(),
      onError: (error) => {
        setOrderedVariants(range.variants);
        showMutationError(error, 'Unable to reorder Variants.');
      },
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    if (reorderMutation.isPending) {
      return;
    }

    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = orderedVariants.findIndex((variant) => variant.id === active.id);
    const newIndex = orderedVariants.findIndex((variant) => variant.id === over.id);
    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const next = arrayMove(orderedVariants, oldIndex, newIndex);
    setOrderedVariants(next);
    reorderMutation.mutate({ rangeId: range.id, orderedIds: next.map((variant) => variant.id) });
  };

  const handleCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newName.trim();

    if (!name) {
      return;
    }

    createMutation.mutate({ rangeId: range.id, name });
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Variants</CardTitle>
          <CardDescription>Ordered name-only sub-groups for this Range.</CardDescription>
        </div>
        {canEdit ? (
          <CardAction>
            <form className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row" onSubmit={handleCreate}>
              <Input
                aria-label="New Variant name"
                autoComplete="off"
                className="w-full sm:w-48"
                disabled={createMutation.isPending}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Variant name"
                value={newName}
              />
              <Button disabled={createMutation.isPending || newName.trim().length === 0} type="submit">
                {createMutation.isPending ? (
                  <IconLoader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <IconPlus data-icon="inline-start" />
                )}
                Add
              </Button>
            </form>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
        {orderedVariants.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyIcon />
              <EmptyTitle>No Variants added.</EmptyTitle>
              <EmptyDescription>Add a Variant from the header to group Products inside this Range.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
          >
            <SortableContext
              items={orderedVariants.map((variant) => variant.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-2">
                {orderedVariants.map((variant) => (
                  <VariantRow
                    canEdit={canEdit}
                    dragDisabled={reorderMutation.isPending}
                    key={variant.id}
                    onRemove={() => removeMutation.mutate({ id: variant.id, rangeId: range.id })}
                    onRename={(name) => updateMutation.mutateAsync({ id: variant.id, rangeId: range.id, name })}
                    removePending={removeMutation.isPending && removeMutation.variables?.id === variant.id}
                    renamePending={updateMutation.isPending && updateMutation.variables?.id === variant.id}
                    variant={variant}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
};

type VariantRowProps = {
  canEdit: boolean;
  dragDisabled: boolean;
  removePending: boolean;
  renamePending: boolean;
  variant: ProductRangeVariant;
  onRemove: () => void;
  onRename: (name: string) => Promise<unknown>;
};

const VariantRow: React.FC<VariantRowProps> = ({
  canEdit,
  dragDisabled,
  removePending,
  renamePending,
  variant,
  onRemove,
  onRename,
}) => {
  const [draftName, setDraftName] = useState(variant.name);
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: variant.id,
    disabled: !canEdit || dragDisabled,
  });
  const sortableStyle: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
  };

  useEffect(() => {
    setDraftName(variant.name);
  }, [variant.name]);

  const commitRename = () => {
    const name = draftName.trim();

    if (!name) {
      setDraftName(variant.name);
      return;
    }

    if (name !== variant.name) {
      void onRename(name).catch(() => setDraftName(variant.name));
    }
  };

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border bg-background p-2',
        isDragging && 'relative z-10 opacity-80 shadow-lg',
      )}
      ref={setNodeRef}
      style={sortableStyle}
    >
      {canEdit ? (
        <Button
          aria-label={`Reorder ${variant.name}`}
          className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
          disabled={dragDisabled}
          size="icon-sm"
          type="button"
          variant="ghost"
          {...attributes}
          {...listeners}
        >
          <IconGripVertical />
        </Button>
      ) : null}
      <Input
        aria-label={`Variant name: ${variant.name}`}
        autoComplete="off"
        disabled={!canEdit || renamePending}
        onBlur={commitRename}
        onChange={(event) => setDraftName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        value={draftName}
      />
      {canEdit ? (
        <Button
          aria-label={`Remove ${variant.name}`}
          disabled={removePending}
          onClick={onRemove}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <IconTrash />
        </Button>
      ) : null}
    </div>
  );
};
