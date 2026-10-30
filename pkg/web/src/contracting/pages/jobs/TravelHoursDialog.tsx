import { TRAVEL_HOURS_EXPLANATION, travelProvenance } from '@pkg/domain/contracting';
import { type Assignment, Hours } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useResetOnOpen } from '@/contracting/hooks/use-contracting-write.js';
import { useTRPC } from '@/lib/trpc.js';
import { useJobWrite } from './use-job-write.js';

const TravelValues = z.object({ travelHours: Hours });

/** Sets a stint's Travel Hours by hand; nothing recalculates them after. */
export function TravelHoursDialog({ stint, onClose }: { stint: Assignment | null; onClose: () => void }) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const set = useMutation(trpc.contractingJobs.assignments.setTravel.mutationOptions(write.dialog));
  useResetOnOpen(set, !!stint);
  return (
    <CreateEntityDialog
      key={stint?.id ?? 'closed'}
      open={!!stint}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={<MachineDialogTitle machine={stint}>Travel Hours</MachineDialogTitle>}
      description={TRAVEL_HOURS_EXPLANATION}
      contentClassName="sm:max-w-md"
      submitLabel="Save Travel Hours"
      defaultValues={{ travelHours: stint?.travelHours ?? 0 }}
      validator={TravelValues}
      onCreate={({ travelHours }) =>
        stint ? set.mutateAsync({ assignmentId: stint.id, travelHours }) : Promise.resolve()
      }
      onCreated={onClose}
    >
      {(form) => (
        <>
          <form.AppField name="travelHours">
            {(field) => <field.NumberField label="Travel Hours" decimals={1} min={0} unit="hours" />}
          </form.AppField>
          <p className="text-sm text-muted-foreground">{stint ? `Travel ${travelProvenance(stint)}.` : null}</p>
          <ErrorMessage error={set.error} fallbackMessage="Unable to set Travel Hours." />
        </>
      )}
    </CreateEntityDialog>
  );
}
