import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import type { QuickSwitchActor } from '@pkg/schema/equipment';

/** Whether the Stores tab shows. The layout's `storesSeat` is the finer gate once the session is known. */
export function canEnterStores(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'equipment_inventory:move') || hasPermission(access, 'equipment_inventory:count');
}

/**
 * How someone sits at Stores: `tablet` moves stock and names the Operator through the Quick-switch;
 * `counter` only counts, as themselves. `null` keeps them out.
 */
export type StoresSeat = { kind: 'tablet' } | { kind: 'counter'; self: QuickSwitchActor };

export function storesSeat({
  access,
  user,
}: {
  access: UserAccessSummary | null | undefined;
  user: { id: string; image?: string | null; isDevice?: boolean | null; name: string };
}): StoresSeat | null {
  if (hasPermission(access, 'equipment_inventory:move')) return { kind: 'tablet' };
  if (!hasPermission(access, 'equipment_inventory:count') || user.isDevice === true) return null;

  return { kind: 'counter', self: { id: user.id, name: user.name, thumbnailDataUrl: user.image ?? null } };
}

/** Whether a counter may open the Stores route these segments name: the home and the stocktake walk. */
export function counterMayOpen(segments: readonly string[]): boolean {
  const below = segments[segments.indexOf('stores') + 1];

  return below === undefined || below === 'stocktake';
}
