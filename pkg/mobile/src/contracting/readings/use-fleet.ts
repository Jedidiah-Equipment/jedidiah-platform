import { FieldMachine, FieldReading } from '@pkg/schema/contracting';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { z } from 'zod';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { apiBaseUrl } from '@/lib/api-base-url';
import { useAuthSession, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { usePersistedState } from '@/lib/use-persisted-state';

const FIELD_READ_PERMISSIONS = ['contracting_machine:read', 'contracting_reading:capture'] as const;
const FieldMachines = FieldMachine.array();
const FieldReadings = FieldReading.array();
const isFieldMachines = (value: unknown): value is z.infer<typeof FieldMachines> =>
  FieldMachines.safeParse(value).success;
const isFieldReadings = (value: unknown): value is FieldReading[] => FieldReadings.safeParse(value).success;

type SavedQuery<T> = {
  canRead: boolean;
  data: T | undefined;
  isError: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  refetch: () => Promise<unknown>;
};

/** Mirror live data into storage scoped to API and operator, so field screens work offline. */
function useSavedQueryData<T>(name: string, isValid: (value: unknown) => value is T, live: T | undefined) {
  const session = useAuthSession();
  // v2: field machines carry their category icon and colour (#1434).
  const key = contractingStorageKey('fleet', 'v2', apiBaseUrl, session.user.id, name);
  const [saved, save] = usePersistedState<T | undefined>(key, undefined, isValid);
  useEffect(() => {
    if (live !== undefined) save(live);
  }, [live, save]);
  return live ?? saved;
}

function savedQuery<T>(canRead: boolean, query: UseQueryResult<T, unknown>, data: T | undefined): SavedQuery<T> {
  return {
    canRead,
    data: canRead ? data : undefined,
    isError: query.isError,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
  };
}

export function useFleet() {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: canRead }));
  return savedQuery(canRead, query, useSavedQueryData('machines', isFieldMachines, query.data));
}

export function useMachineReadings(machineId: string) {
  const canRead = useSessionPermission(...FIELD_READ_PERMISSIONS);
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingReadings.fieldHistory.queryOptions({ machineId }, { enabled: canRead }));
  return savedQuery(canRead, query, useSavedQueryData(`readings:${machineId}`, isFieldReadings, query.data));
}
