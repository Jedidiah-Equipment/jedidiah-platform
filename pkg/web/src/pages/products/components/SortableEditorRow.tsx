import { useSortable } from '@dnd-kit/sortable';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

type SortableEditorRowProps = {
  id: string;
  reorderLabel: string;
  removeLabel: string;
  onRemove: () => void;
  children: React.ReactNode;
};

// One reorderable editor row: a drag grip, the row's field inputs (children), and a remove button. The grip is
// keyboard-operable through the dnd-kit sortable listeners; the parallel-id list state lives in
// {@link useSortableFieldRows}, which owns the matching DndContext/SortableContext.
export const SortableEditorRow: React.FC<SortableEditorRowProps> = ({
  id,
  reorderLabel,
  removeLabel,
  onRemove,
  children,
}) => {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const sortableStyle: React.CSSProperties = {
    transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
    transition,
  };

  return (
    <div
      className={cn('flex items-start gap-2', isDragging && 'relative z-10 opacity-80')}
      ref={setNodeRef}
      style={sortableStyle}
    >
      <Button
        aria-label={reorderLabel}
        className="mt-px shrink-0 cursor-grab touch-none active:cursor-grabbing"
        size="icon-sm"
        type="button"
        variant="ghost"
        {...attributes}
        {...listeners}
      >
        <IconGripVertical />
      </Button>
      {children}
      <Button
        aria-label={removeLabel}
        className="mt-px"
        onClick={onRemove}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <IconTrash />
      </Button>
    </div>
  );
};
