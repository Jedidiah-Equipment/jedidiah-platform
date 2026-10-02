import type { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import { useEffect, useRef, useState } from 'react';

/**
 * A served list the person reorders by dragging: the drop shows at once, `save` persists it, and a refused save
 * puts the served order back. The copy resyncs whenever the served rows change.
 */
export function useOptimisticOrder<T extends { id: string }>(
  rows: readonly T[] | undefined,
  save: (orderedIds: string[]) => Promise<unknown>,
) {
  const [ordered, setOrdered] = useState<T[]>(() => [...(rows ?? [])]);
  const [isSaving, setIsSaving] = useState(false);
  const served = useRef(rows);
  served.current = rows;
  useEffect(() => {
    if (rows) setOrdered([...rows]);
  }, [rows]);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    // The server treats each payload as authoritative, so overlapping requests could persist a stale order.
    if (isSaving || !over || active.id === over.id) return;
    const oldIndex = ordered.findIndex((row) => row.id === active.id);
    const newIndex = ordered.findIndex((row) => row.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ordered, oldIndex, newIndex);
    setOrdered(next);
    setIsSaving(true);
    save(next.map((row) => row.id))
      .catch(() => {
        if (served.current) setOrdered([...served.current]);
      })
      .finally(() => setIsSaving(false));
  };

  return { rows: ordered, isSaving, onDragEnd };
}
