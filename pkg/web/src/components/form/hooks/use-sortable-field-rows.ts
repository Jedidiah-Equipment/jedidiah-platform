import { type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useState } from 'react';

import type { ArrayFieldApi } from '../types.js';

export type SortableFieldRows<TValue> = {
  rowKeys: string[];
  sensors: ReturnType<typeof useSensors>;
  addRow: (value: TValue) => void;
  removeRow: (index: number) => void;
  handleDragEnd: (event: DragEndEvent) => void;
};

// Backs a reorderable list of form-array rows whose elements carry no intrinsic id (plain strings or small
// value objects). Keeps a parallel array of stable ids in lockstep with the field's add/remove/reorder so each
// row's React identity — and its input focus — follows the row rather than its index. The form remounts per
// entity (keyed by id), so the initial id count always matches the field value.
export function useSortableFieldRows<TValue>(
  field: ArrayFieldApi<TValue>,
  onStructuralChange: () => void,
): SortableFieldRows<TValue> {
  const [rowKeys, setRowKeys] = useState<string[]>(() => field.state.value.map(() => crypto.randomUUID()));

  // A small distance constraint keeps clicks on the row inputs and buttons from starting a drag. The keyboard
  // sensor keeps the grip handle operable (focus, Space to pick up, arrows to move) so reordering stays accessible.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const addRow = (value: TValue) => {
    field.pushValue(value);
    setRowKeys((current) => [...current, crypto.randomUUID()]);
    onStructuralChange();
  };

  const removeRow = (index: number) => {
    field.removeValue(index);
    setRowKeys((current) => current.filter((_, position) => position !== index));
    onStructuralChange();
  };

  const reorder = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || toIndex < 0 || toIndex >= field.state.value.length) {
      return;
    }

    field.moveValue(fromIndex, toIndex);
    setRowKeys((current) => {
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);

      if (moved === undefined) {
        return current;
      }

      next.splice(toIndex, 0, moved);
      return next;
    });
    onStructuralChange();
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const fromIndex = rowKeys.indexOf(String(active.id));
    const toIndex = rowKeys.indexOf(String(over.id));

    if (fromIndex === -1 || toIndex === -1) {
      return;
    }

    reorder(fromIndex, toIndex);
  };

  return { rowKeys, sensors, addRow, removeRow, handleDragEnd };
}
