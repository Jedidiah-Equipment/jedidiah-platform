import { getPlantDateNow } from '@pkg/domain';
import { type Machine, openServiceFields } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachinePickerField } from '@/contracting/components/MachinePickerField.js';
import { hoursOrDash, machineHoursToService, NextServiceDue } from '@/contracting/components/MachineServiceDue.js';
import { mechanicFieldOptions } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { BookServiceValues } from './types.js';

/**
 * Books one Machine in, then opens the new Service Record's page; mounted while it is being booked, so closing unmounts
 * it. The Machine page's Services card and the Services page's pinned rows open it on their Machine; the Services
 * page's own button opens it with none, so the Machine is picked from the active fleet not already Booked In, with its
 * hours shown once picked.
 */
export function BookServiceDialog({
  machineId,
  mechanicOptions,
  onClose,
}: {
  machineId: string | null;
  mechanicOptions: readonly SearchableComboboxOption[];
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const write = useContractingWrite(useQueryInvalidation().invalidateServices);
  const book = useMutation(trpc.contractingServices.open.mutationOptions(write.dialog));
  const picksMachine = machineId === null;
  const machines = useQuery(
    trpc.contractingFleet.machines.list.queryOptions({ status: 'active' }, { enabled: picksMachine }),
  );
  const bookable = useMemo(() => (machines.data ?? []).filter((machine) => !machine.serviceBookedIn), [machines.data]);
  const defaultValues: BookServiceValues = {
    machineId: machineId ?? '',
    startDate: getPlantDateNow(),
    primaryMechanicUserId: '',
    notes: '',
  };
  return (
    <CreateEntityDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Book a service"
      description="Book the Machine in. Close the service when it leaves the workshop."
      submitLabel="Book service"
      defaultValues={defaultValues}
      validator={BookServiceValues}
      onCreate={(values) => book.mutateAsync({ machineId: values.machineId, ...openServiceFields(values) })}
      onCreated={(record) => {
        onClose();
        void navigate({ to: '/contracting/services/$id', params: { id: record.id } });
      }}
    >
      {(form) => (
        <>
          {picksMachine ? (
            <>
              <form.AppField name="machineId">
                {() => <MachinePickerField machines={bookable} emptyMessage="No machines to book in." />}
              </form.AppField>
              <ErrorMessage error={machines.error} fallbackMessage="Unable to load the Machines." />
              <form.Subscribe selector={(state) => state.values.machineId}>
                {(picked) => <MachineServiceSummary machine={bookable.find((machine) => machine.id === picked)} />}
              </form.Subscribe>
            </>
          ) : null}
          <form.AppField name="startDate">{(field) => <field.DatePickerField label="Start date" />}</form.AppField>
          <form.AppField name="primaryMechanicUserId">
            {(field) => (
              <field.ComboboxField
                label="Mechanic"
                placeholder="Search mechanics..."
                emptyMessage="No mechanics found."
                options={mechanicFieldOptions(mechanicOptions)}
              />
            )}
          </form.AppField>
          <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
          <ErrorMessage error={book.error} fallbackMessage="Unable to book the service." />
        </>
      )}
    </CreateEntityDialog>
  );
}

/** The picked Machine's current hours and Next Service Due, so the right one is booked in. */
function MachineServiceSummary({ machine }: { machine: Machine | undefined }) {
  if (!machine) return null;
  return (
    <dl className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="space-y-1">
        <dt className="text-muted-foreground">Current hours</dt>
        <dd>{hoursOrDash(machine.latestReadingHours)}</dd>
      </div>
      <div className="space-y-1">
        <dt className="text-muted-foreground">Next service due</dt>
        <dd>
          <NextServiceDue hours={machine.nextServiceDueHours} toGo={machineHoursToService(machine)} />
        </dd>
      </div>
    </dl>
  );
}
