import { UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

const PlanValues = z.object({
  machineId: requiredSelection(UUID, 'Choose a Machine'),
  implementId: emptyStringOr(UUID),
  driverUserId: emptyStringOr(z.string()),
});

export function PlanMachineDialog({
  jobId,
  open,
  onOpenChange,
}: {
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const machines = useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: open }));
  const implementOptions = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: open }));
  const drivers = useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: open }));
  const plan = useMutation(
    trpc.contractingJobs.assignments.plan.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to plan Machine.'),
    }),
  );
  return (
    <CreateEntityDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Plan machine"
      defaultValues={{ machineId: '', implementId: '', driverUserId: '' }}
      validator={PlanValues}
      onCreate={(values) =>
        plan.mutateAsync({
          jobId,
          machineId: values.machineId,
          implementId: values.implementId || null,
          driverUserId: values.driverUserId || null,
        })
      }
      onCreated={() => onOpenChange(false)}
    >
      {(form) => (
        <>
          <form.AppField name="machineId">
            {(field) => (
              <field.ComboboxField
                label="Machine"
                onValueSelect={(id) => !machines.data?.some((row) => row.id === id && row.onSiteJobNumber !== null)}
                options={(machines.data ?? []).map((row) => ({
                  value: row.id,
                  label: `${row.code} · ${row.make} ${row.model}${row.onSiteJobNumber ? ` · On Job ${row.onSiteJobNumber}` : ''}`,
                }))}
              />
            )}
          </form.AppField>
          <form.AppField name="implementId">
            {(field) => (
              <field.ComboboxField
                label="Implement"
                options={[
                  { value: '', label: 'None' },
                  ...(implementOptions.data ?? []).map((row) => ({ value: row.id, label: row.code })),
                ]}
              />
            )}
          </form.AppField>
          <form.AppField name="driverUserId">
            {(field) => (
              <field.ComboboxField
                label="Driver"
                placeholder="Machine's current driver"
                options={[
                  { value: '', label: "Machine's current driver" },
                  ...(drivers.data ?? []).map((row) => ({ value: row.id, label: row.name })),
                ]}
              />
            )}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
