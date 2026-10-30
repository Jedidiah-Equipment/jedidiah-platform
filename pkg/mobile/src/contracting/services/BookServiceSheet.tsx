import { formatHours, getPlantDateNow } from '@pkg/domain';
import {
  hoursToServiceLabel,
  serviceDueNeedsAttention,
  serviceDueStatusColorClassNames,
} from '@pkg/domain/contracting';
import { BookServiceValues, type FieldMachine, openServiceFields, type ServiceRecord } from '@pkg/schema/contracting';
import { revalidateLogic } from '@tanstack/react-form';
import { View } from 'react-native';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useBusyAction } from '@/lib/use-busy-action';
import { useServiceMechanicOptions, useServiceMutation } from './use-services';

const BOOK_FAILED = 'Could not book the service. Check your connection and try again.';

/**
 * Books a Machine in for a service; mounted while open, so each open starts from today. Opened on a Machine it books
 * that one; opened with none, the Machine is picked from the field fleet not already Booked In.
 */
export function BookServiceSheet({
  machineId,
  onBooked,
  onClose,
}: {
  machineId: string | null;
  onBooked?: (record: ServiceRecord) => void;
  onClose: () => void;
}) {
  const mechanicOptions = useServiceMechanicOptions();
  const fleet = useFleet();
  const book = useServiceMutation((services) => services.open);
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const bookable = (fleet.data ?? []).filter((machine) => !machine.serviceBookedIn);
  const defaultValues: BookServiceValues = {
    machineId: machineId ?? '',
    startDate: getPlantDateNow(),
    primaryMechanicUserId: '',
    notes: '',
  };
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: BookServiceValues },
    onSubmit: ({ value }) =>
      run(async () => {
        const record = await book.mutateAsync({ machineId: value.machineId, ...openServiceFields(value) });
        onClose();
        showToast('success', 'Booked in');
        onBooked?.(record);
      }, BOOK_FAILED),
  });
  return (
    <ModalSheet
      title="Book a service"
      subtitle="Book the Machine in. Close the service here when it leaves the workshop."
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Book service" onPress={() => void form.handleSubmit()} />}
      // Held open until the booking and its refetch settle, so a reopened sheet cannot book the Machine in twice.
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {machineId === null ? (
        <form.AppField name="machineId">
          {(field) => (
            <field.SearchSelectField
              label="Machine"
              placeholder="Choose the Machine"
              searchPlaceholder="Search machines…"
              emptyMessage={fleet.isError ? 'The Machines could not be loaded.' : 'No machines to book in.'}
              options={bookable.map((machine) => ({
                label: `${machine.code} · ${machine.make} ${machine.model}`,
                value: machine.id,
              }))}
            />
          )}
        </form.AppField>
      ) : null}
      <form.Subscribe selector={(state) => state.values.machineId}>
        {(picked) => <MachineServiceSummary machine={fleet.data?.find((machine) => machine.id === picked)} />}
      </form.Subscribe>
      <form.AppField name="startDate">{(field) => <field.DateField label="Start date" />}</form.AppField>
      <form.AppField name="primaryMechanicUserId">
        {(field) => (
          <field.SearchSelectField
            label="Mechanic"
            placeholder="No Mechanic yet"
            searchPlaceholder="Search mechanics…"
            emptyMessage="No mechanics match."
            options={mechanicOptions}
          />
        )}
      </form.AppField>
      <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
    </ModalSheet>
  );
}

/** The Machine's current hours and Next Service Due, so the right one is booked in. */
function MachineServiceSummary({ machine }: { machine: FieldMachine | undefined }) {
  if (!machine) return null;
  const toGo = machine.hoursToService;
  return (
    <View className="flex-row gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <View className="flex-1 gap-1">
        <Text className="text-sm text-muted-foreground">Known hours</Text>
        <Text className="text-foreground" weight="semibold">
          {machine.knownHours === null ? 'No known hours' : formatHours(machine.knownHours)}
        </Text>
      </View>
      <View className="flex-1 gap-1">
        <Text className="text-sm text-muted-foreground">Next service due</Text>
        <Text className="text-foreground" weight="semibold">
          {machine.nextServiceDueHours === null ? 'Not set' : formatHours(machine.nextServiceDueHours)}
        </Text>
        {machine.nextServiceDueHours !== null && toGo !== null ? (
          <Text
            className={`text-sm ${serviceDueNeedsAttention(machine.serviceDueStatus) ? serviceDueStatusColorClassNames[machine.serviceDueStatus].text : 'text-muted-foreground'}`}
          >
            {hoursToServiceLabel(toGo)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
