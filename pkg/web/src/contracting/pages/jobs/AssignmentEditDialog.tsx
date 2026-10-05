import type { Assignment } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc.js';
import { AssignmentEditorDialog } from './AssignmentEditorDialog.js';
import { useAssignmentOptions } from './use-assignment-options.js';
import { useJobWrite } from './use-job-write.js';

export function AssignmentEditDialog({ stint }: { stint: Assignment }) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const options = useAssignmentOptions({ enabled: true, stint, noImplementLabel: '—', noDriverLabel: '—' });
  const patch = useMutation(trpc.contractingJobs.assignments.patch.mutationOptions(write.dialog));
  return (
    <AssignmentEditorDialog
      stint={stint}
      implementOptions={options.implementOptions}
      driverOptions={options.driverOptions}
      error={patch.error}
      triggerVariant="outline"
      onStart={() => patch.reset()}
      onSave={async (draft) => {
        await patch.mutateAsync({
          id: stint.id,
          implementId: draft.implementId || null,
          driverUserId: draft.driverUserId || null,
        });
      }}
    />
  );
}
