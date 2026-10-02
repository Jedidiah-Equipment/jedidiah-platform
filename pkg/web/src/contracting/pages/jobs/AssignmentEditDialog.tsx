import type { Assignment } from '@pkg/schema/contracting';
import { useMutation } from '@tanstack/react-query';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useTRPC } from '@/lib/trpc.js';
import { AssignmentEditorDialog } from './AssignmentEditorDialog.js';
import { useMachines } from './machines-context.js';
import { useJobWrite } from './use-job-write.js';

export function AssignmentEditDialog({ stint }: { stint: Assignment }) {
  const { implementOptions, drivers } = useMachines();
  const trpc = useTRPC();
  const write = useJobWrite();
  const patch = useMutation(trpc.contractingJobs.assignments.patch.mutationOptions(write.dialog));
  const implementsForSelect = [
    { value: '', label: '—' },
    ...implementOptions.map((entry) => ({
      value: entry.id,
      label: entry.code,
      icon: <CategoryIcon icon={entry.categoryIcon} colour={entry.categoryColour} size={14} />,
    })),
  ];
  const driversForSelect = [
    { value: '', label: '—' },
    ...drivers.map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  if (
    stint.implementId &&
    stint.implementCode &&
    !implementsForSelect.some((entry) => entry.value === stint.implementId)
  )
    implementsForSelect.push({ value: stint.implementId, label: stint.implementCode });
  if (stint.driverUserId && stint.driverName && !driversForSelect.some((entry) => entry.value === stint.driverUserId))
    driversForSelect.push({ value: stint.driverUserId, label: stint.driverName });
  return (
    <AssignmentEditorDialog
      stint={stint}
      implementOptions={implementsForSelect}
      driverOptions={driversForSelect}
      error={patch.error}
      isPending={patch.isPending}
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
