import { getRoleSlotsPermissions } from '@pkg/domain';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiBaseUrl } from '@/lib/api-base-url';
import { getSessionRoleSlots, useAuthSession } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

/** Keep only the data these field screens need, scoped to API and operator. */
function useSavedData<T>(name: string, live: T | undefined) {
  const session = useAuthSession();
  // v2: field machines carry their category icon and colour (#1434).
  const key = `contracting:fleet:v2:${apiBaseUrl}:${session.user.id}:${name}`;
  const [saved, setSaved] = useState<{ key: string; data: T } | null>(null);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key)
      .then((raw) => {
        if (active && raw) setSaved({ key, data: JSON.parse(raw) as T });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  useEffect(() => {
    if (live !== undefined) void AsyncStorage.setItem(key, JSON.stringify(live)).catch(() => {});
  }, [key, live]);
  return live ?? (saved?.key === key ? saved.data : undefined);
}
function useCanReadField() {
  const slots = getSessionRoleSlots(useAuthSession());
  const permissions = slots ? getRoleSlotsPermissions(slots) : [];
  return permissions.includes('contracting_machine:read') || permissions.includes('contracting_reading:capture');
}
export function useFleet(enabled = true) {
  const canRead = useCanReadField();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: enabled && canRead }),
  );
  const data = useSavedData('machines', query.data);
  return { ...query, data: canRead ? data : undefined, canRead };
}
export function useMachineReadings(machineId: string, enabled = true) {
  const canRead = useCanReadField();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingReadings.fieldHistory.queryOptions({ machineId }, { enabled: enabled && canRead }),
  );
  const data = useSavedData(`readings:${machineId}`, query.data);
  return { ...query, data: canRead ? data : undefined, canRead };
}
