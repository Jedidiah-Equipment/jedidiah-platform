import { UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { emptyStringOr, requiredSelection } from '@/components/form/utils/form-schema.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useTRPC } from '@/lib/trpc.js';
import { useJobWrite, useResetOnOpen } from './use-job-write.js';

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
  const write = useJobWrite();
  const machines = useQuery(trpc.contractingReadings.fieldMachines.queryOptions(undefined, { enabled: open }));
  const implementOptions = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: open }));
  const drivers = useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: open }));
  const plan = useMutation(trpc.contractingJobs.assignments.add.mutationOptions(write.dialog));
  useResetOnOpen(plan, open);
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
          ...(values.driverUserId ? { driverUserId: values.driverUserId } : {}),
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
                options={(machines.data ?? []).map((row) => ({
                  value: row.id,
                  icon: <CategoryIcon icon={row.categoryIcon} colour={row.categoryColour} size={14} />,
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
                  ...(implementOptions.data ?? []).map((row) => ({
                    value: row.id,
                    label: row.code,
                    icon: <CategoryIcon icon={row.categoryIcon} colour={row.categoryColour} size={14} />,
                  })),
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
          <ErrorMessage error={plan.error} fallbackMessage="Unable to plan Machine." />
        </>
      )}
    </CreateEntityDialog>
  );
}
