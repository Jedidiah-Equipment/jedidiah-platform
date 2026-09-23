import type { Assignment, FieldDriver, FieldImplement, JobReading } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { createContext, useContext } from 'react';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import type { JobSheet } from './types.js';

export type SelectedReading = { reading: JobReading; stint: Assignment };

export function useMachineMutations() {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const options = (message: string) => ({
    onSuccess: invalidateJobs,
    onError: (error: unknown) => showError(error, message),
  });
  return {
    patch: useMutation(
      trpc.contractingJobs.assignments.patch.mutationOptions(options('Unable to update Machine Assignment.')),
    ),
    remove: useMutation(
      trpc.contractingJobs.assignments.remove.mutationOptions(options('Unable to remove Machine Assignment.')),
    ),
    removeMeasure: useMutation(
      trpc.contractingJobs.measures.remove.mutationOptions(options('Unable to remove Measure.')),
    ),
  };
}

/** What every Machines cell reads: permissions, pick-list options, the writes, and the dialogs it opens. */
type Machines = {
  sheet: JobSheet;
  implementOptions: readonly FieldImplement[];
  drivers: readonly FieldDriver[];
  mutations: ReturnType<typeof useMachineMutations>;
  openReading: (selected: SelectedReading) => void;
  openGap: (stint: Assignment) => void;
  openDeparture: (stint: Assignment) => void;
};

export const MachinesContext = createContext<Machines | null>(null);

export function useMachines() {
  const machines = useContext(MachinesContext);
  if (!machines) throw new Error('Machines cells render inside MachinesCard.');
  return machines;
}
