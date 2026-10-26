import type { Machine } from '@pkg/schema/contracting';
import { IconArrowRight } from '@tabler/icons-react';
import { Link } from '@tanstack/react-router';
import { ReadOnlyField } from '@/components/form/fields/ReadOnlyField.js';
import { Badge } from '@/components/ui/badge.js';
import { buttonVariants } from '@/components/ui/button.js';
import { useCan } from '@/hooks/use-access.js';
import { cn } from '@/lib/utils';

/**
 * The Machine's John Deere Link, read-only: links are made on the John Deere tab of Settings, which an unlinked
 * Machine points whoever may open it to.
 */
export function MachineJohnDeereField({
  machine: { johnDeere, serialNumber },
}: {
  machine: Pick<Machine, 'johnDeere' | 'serialNumber'>;
}) {
  const { can: managesSettings } = useCan('contracting_settings:update');
  return (
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
      action={
        !johnDeere && managesSettings ? (
          <Link
            to="/contracting/settings"
            search={{ tab: 'john-deere' }}
            className={cn(buttonVariants({ variant: 'default', size: 'default' }), 'shrink-0')}
          >
            Link in Settings
            <IconArrowRight data-icon="inline-end" />
          </Link>
        ) : undefined
      }
    />
  );
}
