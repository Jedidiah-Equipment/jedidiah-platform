import type { AssignmentDetail } from '@pkg/schema/contracting';
import { useAppForm } from '@/components/form';
import { ModalSheet, SheetSubmitButton } from '@/components/ModalSheet';
import { useAppToast } from '@/components/ui/toast';
import { StintResourceFields, stintResourceDefaults } from '@/contracting/components/StintOverrideCard';
import { usePatchStint } from '@/contracting/jobs/use-jobs';
import { useBusyAction } from '@/lib/use-busy-action';

const CHANGE_FAILED = 'Could not change the Implement or Driver. Check your connection and try again.';

/** Changes the Implement and Driver of one stint, as the web stint card's pencil does. */
export function ChangeStintResourcesSheet({ stint, onClose }: { stint: AssignmentDetail; onClose: () => void }) {
  const patch = usePatchStint();
  const showToast = useAppToast();
  const { busy, error, run } = useBusyAction();
  const form = useAppForm({
    defaultValues: stintResourceDefaults(stint),
    onSubmit: ({ value }) =>
      run(async () => {
        await patch.mutateAsync({
          id: stint.id,
          implementId: value.implementId || null,
          driverUserId: value.driverUserId || null,
        });
        onClose();
        showToast('success', 'Implement and driver changed');
      }, CHANGE_FAILED),
  });
  return (
    <ModalSheet
      title="Implement & driver"
      subtitle={`${stint.machineCode} on this Job only. The Machine's default Driver stays as it is.`}
      error={error}
      footer={<SheetSubmitButton isSubmitting={busy} label="Save" onPress={() => void form.handleSubmit()} />}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <StintResourceFields form={form} />
    </ModalSheet>
  );
}
