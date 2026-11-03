import { TRAVEL_HOURS_EXPLANATION, travelProvenance } from '@pkg/domain/contracting';
import { type AssignmentDetail, TravelHoursSetInput } from '@pkg/schema/contracting';
import { revalidateLogic } from '@tanstack/react-form';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { Text } from '@/components/ui/text';
import { useAppToast } from '@/components/ui/toast';
import { useSetTravel } from '@/contracting/jobs/use-jobs';
import { useBusyAction } from '@/lib/use-busy-action';

const TravelValues = TravelHoursSetInput.pick({ travelHours: true });
const SET_FAILED = 'Could not set the Travel Hours. Check your connection and try again.';

/** Sets a stint's Travel Hours by hand, as the web stint card's pencil does; nothing recalculates them after. */
export function TravelHoursSheet({ stint, onClose }: { stint: AssignmentDetail; onClose: () => void }) {
  const set = useSetTravel();
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const form = useAppForm({
    defaultValues: { travelHours: stint.travelHours ?? 0 },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: TravelValues },
    onSubmit: ({ value }) =>
      run(async () => {
        await set.mutateAsync({ assignmentId: stint.id, travelHours: value.travelHours });
        onClose();
        showToast('success', 'Travel Hours set');
      }, SET_FAILED),
  });
  return (
    <ModalSheet
      title="Travel Hours"
      subtitle={`${stint.machineCode}. ${TRAVEL_HOURS_EXPLANATION}`}
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Save" onPress={() => void form.handleSubmit()} />}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form.AppField name="travelHours">{(field) => <field.NumberField label="Travel Hours" />}</form.AppField>
      <Text className="-mt-2 text-xs text-muted-foreground">{`Travel ${travelProvenance(stint)}.`}</Text>
    </ModalSheet>
  );
}
