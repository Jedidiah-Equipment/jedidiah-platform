import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { IconGripVertical } from '@tabler/icons-react';
import type React from 'react';
import { Card, CardHeader } from '@/components/ui/card.js';
import { cn } from '@/lib/utils.js';

type SortableCardListProps<T extends { id: string }> = {
  /** From `useOptimisticOrder`. */
  order: { rows: T[]; isSaving: boolean; onDragEnd: (event: DragEndEvent) => void };
  canReorder: boolean;
  /** Names a row in its "Reorder …" and "Open …" labels. */
  label: (row: T) => string;
  /** Makes each card a button that opens its row. */
  onOpen?: (row: T) => void;
  headerClassName: string;
  emptyMessage: string;
  /** The card header's content. `grip` is null when the person cannot reorder. */
  children: (row: T, grip: React.ReactNode) => React.ReactNode;
};

export function SortableCardList<T extends { id: string }>({
  order,
  canReorder,
  label,
  onOpen,
  headerClassName,
  emptyMessage,
  children,
}: SortableCardListProps<T>) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  if (order.rows.length === 0)
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
        {emptyMessage}
      </div>
    );
  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={order.onDragEnd}
      sensors={sensors}
    >
      <SortableContext items={order.rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {order.rows.map((row) => (
            <SortableCard
              canReorder={canReorder}
              disabled={order.isSaving}
              headerClassName={headerClassName}
              id={row.id}
              key={row.id}
              label={label(row)}
              onOpen={onOpen ? () => onOpen(row) : undefined}
            >
              {(grip) => children(row, grip)}
            </SortableCard>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCard({
  canReorder,
  disabled,
  headerClassName,
  id,
  label,
  onOpen,
  children,
}: {
  canReorder: boolean;
  disabled: boolean;
  headerClassName: string;
  id: string;
  label: string;
  onOpen: (() => void) | undefined;
  children: (grip: React.ReactNode) => React.ReactNode;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id,
    // Block new drags while a reorder request is in flight so overlapping reorders can't race.
    disabled: !canReorder || disabled,
  });
  const grip = canReorder ? (
    <button
      aria-label={`Reorder ${label}`}
      className={cn(
        'touch-none text-muted-foreground',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing',
      )}
      disabled={disabled}
      onClick={onOpen ? (event) => event.stopPropagation() : undefined}
      type="button"
      {...attributes}
      {...listeners}
    >
      <IconGripVertical />
    </button>
  ) : null;
  return (
    <Card
      className={cn('min-w-0', onOpen && 'cursor-pointer', isDragging && 'z-10 opacity-80 shadow-lg')}
      ref={setNodeRef}
      style={{ transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined, transition }}
      {...(onOpen
        ? {
            'aria-label': `Open ${label}`,
            onClick: onOpen,
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onOpen();
              }
            },
            role: 'button',
            tabIndex: 0,
          }
        : {})}
    >
      {/* The description sits inside a column here, so CardHeader's second description row would stay empty. */}
      <CardHeader className={cn('has-data-[slot=card-description]:grid-rows-none', headerClassName)}>
        {children(grip)}
      </CardHeader>
    </Card>
  );
}
