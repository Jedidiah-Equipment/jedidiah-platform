import { getPlantDateNow } from '@pkg/domain';
import { OpenServiceValues, openServiceFields } from '@pkg/schema/contracting';
import { revalidateLogic } from '@tanstack/react-form';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { useAppToast } from '@/components/ui/toast';
import { useMechanics } from '@/contracting/lib/use-mechanics';
import { useBusyAction } from '@/lib/use-busy-action';
import { useBookService } from './use-services';

const BOOK_FAILED = 'Could not book the service. Check your connection and try again.';

/** Books the Machine on screen in for a service; mounted while open, so each open starts from today. */
export function BookServiceSheet({ machineId, onClose }: { machineId: string; onClose: () => void }) {
  const mechanics = useMechanics('service');
  const book = useBookService();
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const defaultValues: OpenServiceValues = { startDate: getPlantDateNow(), primaryMechanicUserId: '', notes: '' };
  const form = useAppForm({
    defaultValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: OpenServiceValues },
    onSubmit: ({ value }) =>
      run(async () => {
        await book.mutateAsync({ machineId, ...openServiceFields(value) });
        onClose();
        showToast('success', 'Booked in');
      }, BOOK_FAILED),
  });
  return (
    <ModalSheet
      title="Book a service"
      subtitle="Book the Machine in. Close the service on the web when it leaves the workshop."
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Book service" onPress={() => void form.handleSubmit()} />}
      // Held open until the booking and its refetch settle, so a reopened sheet cannot book the Machine in twice.
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form.AppField name="startDate">{(field) => <field.DateField label="Start date" />}</form.AppField>
      <form.AppField name="primaryMechanicUserId">
        {(field) => (
          <field.SearchSelectField
            label="Mechanic"
            placeholder="No Mechanic yet"
            searchPlaceholder="Search mechanics…"
            emptyMessage="No mechanics match."
            options={[
              { label: 'No Mechanic yet', value: '' },
              ...(mechanics.data ?? []).map((mechanic) => ({ label: mechanic.name, value: mechanic.id })),
            ]}
          />
        )}
      </form.AppField>
      <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
    </ModalSheet>
  );
}
