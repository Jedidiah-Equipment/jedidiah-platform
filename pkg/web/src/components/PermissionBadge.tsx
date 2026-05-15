import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type PermissionBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'variant'>;

export function PermissionBadge({ className, ...props }: PermissionBadgeProps) {
  return (
    <Badge
      className={cn(
        'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:border-purple-400/30 dark:bg-purple-400/10 dark:text-purple-300',
        className,
      )}
      variant="outline"
      {...props}
    />
  );
}
