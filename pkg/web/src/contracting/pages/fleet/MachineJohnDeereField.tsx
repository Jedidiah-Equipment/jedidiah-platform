import type { Machine } from '@pkg/schema/contracting';
import { ReadOnlyField } from '@/components/form/fields/ReadOnlyField.js';
import { Badge } from '@/components/ui/badge.js';

/** The Machine's John Deere Link, read-only: links are made on the John Deere tab of Settings. */
export function MachineJohnDeereField({
  machine: { johnDeere, serialNumber },
}: {
  machine: Pick<Machine, 'johnDeere' | 'serialNumber'>;
}) {
  return (
    <div className="grid gap-1.5">
      <ReadOnlyField
        label="John Deere"
        value={
          johnDeere ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate">{[johnDeere.name, serialNumber].filter(Boolean).join(' · ')}</span>
              {johnDeere.lost ? <Badge variant="destructive">Lost</Badge> : null}
            </span>
          ) : (
            <span className="text-muted-foreground">Not linked</span>
          )
        }
      />
      <p className="text-muted-foreground text-xs">Linked on Settings → John Deere</p>
    </div>
  );
}
