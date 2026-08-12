import type { CancellationLinkedUnit } from '@pkg/schema';

import { Checkbox } from '@/components/ui/checkbox.js';
import { Label } from '@/components/ui/label.js';

/**
 * The shared parts of the two cancel dialogs. A Quote cancellation and a Job cancellation reach
 * different records, but where they overlap they must say the same thing in the same words — the
 * machine, the bay time, and what ticking a box will actually do.
 */

/** One thing the cancellation may also do, named and explained so ticking it is an informed act. */
export function CancellationChoice({
  checked,
  description,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  description: string;
  disabled: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Checkbox
        checked={checked}
        className="mt-0.5"
        disabled={disabled}
        id={id}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <div className="grid gap-1">
        <Label className="font-medium" htmlFor={id}>
          {label}
        </Label>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}

/** Naming the holder is the point: nobody should delete a serial without seeing whose machine it is. */
export function describeUnit(unit: CancellationLinkedUnit): string {
  const owner = unit.ownerName === null ? 'It is held as stock.' : `${unit.ownerName} currently holds it.`;

  return `${owner} The serial is never issued again, and its ownership history goes with it.`;
}

/** Slots that have not started are the only ones cancellation gives back. */
export function describeSlotRelease(scheduledSlots: number): string {
  if (scheduledSlots === 0) {
    return 'It has no upcoming slots to release, and any work already done or under way stays on record.';
  }

  const slotLabel = scheduledSlots === 1 ? 'slot' : 'slots';

  return `${scheduledSlots} upcoming ${slotLabel} ${scheduledSlots === 1 ? 'is' : 'are'} removed from bay schedules; work already done or under way stays on record.`;
}
