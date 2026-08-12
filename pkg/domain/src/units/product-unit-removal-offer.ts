/**
 * Whether a cancellation may offer to take the machine with it, and whether that offer arrives
 * already ticked. Both cancel dialogs ask this one question, so the two can never drift on what
 * counts as a build worth keeping.
 *
 * Not offered at all once the build completed: a Job Completion latches, and Unit Removal refuses a
 * completed build whatever became of the sale, so the box could only ever fail.
 *
 * Ticked only when the shop never touched it. A Slot that has started, or stock drawn against the
 * Job, both say metal may already have been cut — the moment to make a person choose rather than let
 * a default choose for them.
 */
export type UnitRemovalOffer = { offered: false } | { offered: true; removeByDefault: boolean };

export function resolveUnitRemovalOffer({
  completedOn,
  hasDrawnStock,
  hasStartedSlot,
}: {
  completedOn: string | null;
  hasDrawnStock: boolean;
  hasStartedSlot: boolean;
}): UnitRemovalOffer {
  if (completedOn !== null) {
    return { offered: false };
  }

  return { offered: true, removeByDefault: !hasStartedSlot && !hasDrawnStock };
}
