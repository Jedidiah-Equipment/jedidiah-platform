import { useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

const FIELD_READ_PERMISSIONS = ['contracting_machine:read', 'contracting_reading:capture'] as const;

export function useFleet() {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: canRead })),
  );
}

export function useMachineReadings(machineId: string) {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingReadings.fieldHistory.queryOptions({ machineId }, { enabled: canRead })),
  );
}
