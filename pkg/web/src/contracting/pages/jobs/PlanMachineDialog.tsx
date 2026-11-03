import { machineDefaultDriverChoice, onJobNote } from '@pkg/domain/contracting';
import { emptyStringOr, requiredSelection, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachinePickerField } from '@/contracting/components/MachinePickerField.js';
import { useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useTRPC } from '@/lib/trpc.js';
import { useAssignmentOptions } from './use-assignment-options.js';
import { useJobWrite } from './use-job-write.js';

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
  const options = useAssignmentOptions({
    enabled: open,
    noImplementLabel: 'None',
    noDriverLabel: machineDefaultDriverChoice(),
  });
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
            {() => <MachinePickerField machines={machines.data ?? []} note={onJobNote} />}
          </form.AppField>
          <form.AppField name="implementId">
            {(field) => <field.ComboboxField label="Implement" options={options.implementOptions} />}
          </form.AppField>
          <form.AppField name="driverUserId">
            {(field) => (
              <field.ComboboxField
                label="Driver"
                placeholder={machineDefaultDriverChoice()}
                options={options.driverOptions}
              />
            )}
          </form.AppField>
          <ErrorMessage error={plan.error} fallbackMessage="Unable to plan Machine." />
        </>
      )}
    </CreateEntityDialog>
  );
}
