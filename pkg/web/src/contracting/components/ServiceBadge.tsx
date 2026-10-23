import type { BadgeColorClassNames } from '@pkg/domain';
import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

/** A service state as a chip: a Machine's badge from `machineServiceBadge`, or a Service Record's status. */
export function ServiceBadge({ label, colours }: { label: string; colours: BadgeColorClassNames }) {
  return (
    <Badge className={cn('shrink-0', colours.chip, colours.text)} variant="outline">
      {label}
    </Badge>
  );
}
