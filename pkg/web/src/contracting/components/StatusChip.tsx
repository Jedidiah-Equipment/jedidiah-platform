import type { BadgeColorClassNames } from '@pkg/domain';
import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

/** A status as a tinted chip: a Breakdown's, a Machine's service state, or a Service Record's. */
export function StatusChip({ label, colours }: { label: string; colours: BadgeColorClassNames }) {
  return (
    <Badge className={cn('shrink-0', colours.chip, colours.text)} variant="outline">
      {label}
    </Badge>
  );
}
