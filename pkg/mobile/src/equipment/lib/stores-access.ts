import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import type { QuickSwitchActor } from '@pkg/schema/equipment';

/** Stores holds two physical acts — moving stock and counting it — and either right opens it. */
export function canEnterStores(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'equipment_inventory:move') || hasPermission(access, 'equipment_inventory:count');
}

/**
 * The fixed actor for someone who counts but cannot move stock, or `null` when the Quick-switch decides.
 *
 * The Quick-switch's list is gated on `equipment_inventory:move`, so a counter has nobody to pick, and
 * on their own phone the count is theirs. A Device Account always goes through the Quick-switch.
 */
export function storesSelfActor({
  access,
  user,
}: {
  access: UserAccessSummary | null | undefined;
  user: { id: string; image?: string | null; isDevice?: boolean | null; name: string };
}): QuickSwitchActor | null {
  if (user.isDevice === true || hasPermission(access, 'equipment_inventory:move')) return null;

  return { id: user.id, name: user.name, thumbnailDataUrl: user.image ?? null };
}
