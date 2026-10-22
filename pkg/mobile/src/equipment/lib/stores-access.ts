import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import type { QuickSwitchActor } from '@pkg/schema/equipment';

export function canEnterStores(access: UserAccessSummary | null | undefined): boolean {
  return hasPermission(access, 'equipment_inventory:move') || hasPermission(access, 'equipment_inventory:count');
}

/** The fixed actor for someone who counts but cannot move stock; `null` leaves it to the Quick-switch. */
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
