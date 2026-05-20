import { permissionDescriptions, permissionLabels } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';

type PermissionBadgeProps = Omit<React.ComponentProps<typeof Badge>, 'children' | 'variant'> & {
  permission: AppPermission;
};

export function PermissionBadge({ className, permission, ...props }: PermissionBadgeProps) {
  const label = permissionLabels[permission];
  const description = permissionDescriptions[permission];

  return (
    <Badge
      aria-label={`${label}: ${description}`}
      className={cn(
        'focus-visible:ring-[3px] focus-visible:ring-ring/50',
        getPermissionColorClassName(permission),
        className,
      )}
      tabIndex={0}
      variant="outline"
      {...props}
    >
      {label}
    </Badge>
  );
}

function getPermissionColorClassName(permission: AppPermission): string {
  const action = permission.split(':')[1];

  if (action === 'archive' || action === 'delete') {
    return 'border-red-500/30 bg-red-500/10 text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300';
  }

  if (action === 'read' || action === 'list') {
    return 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:border-blue-400/30 dark:bg-blue-400/10 dark:text-blue-300';
  }

  return 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:border-purple-400/30 dark:bg-purple-400/10 dark:text-purple-300';
}
