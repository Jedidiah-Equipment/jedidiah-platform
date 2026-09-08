import { getRoleSlotsPermissions } from '@pkg/domain';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';

export function useCapturePermission() {
  const slots = getSessionRoleSlots(useAuthSession());
  return !!slots && getRoleSlotsPermissions(slots).includes('contracting_reading:capture');
}
