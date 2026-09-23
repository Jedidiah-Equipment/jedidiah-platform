import { hasPermission } from '@pkg/domain';

/** Which Jobs, and how much of each, the actor may read: every Job, their own without money, or Completed+ for Invoicing. */
export function readMode(access: Parameters<typeof hasPermission>[0]) {
  if (hasPermission(access, 'contracting_job:read')) return 'all' as const;
  if (hasPermission(access, 'contracting_job:read-own')) return 'own' as const;
  return 'priced' as const;
}
