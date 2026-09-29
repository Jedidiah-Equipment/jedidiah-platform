import type { Assignment } from '@pkg/schema/contracting';
import { IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useMachines } from './machines-context.js';

export function AssignmentEditDialog({ stint }: { stint: Assignment }) {
  const { implementOptions, drivers, mutations } = useMachines();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ implementId: stint.implementId ?? '', driverUserId: stint.driverUserId ?? '' });
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
  const changed = draft.implementId !== (stint.implementId ?? '') || draft.driverUserId !== (stint.driverUserId ?? '');
  const save = async () => {
    if (!changed) return;
    try {
      await mutations.patch.mutateAsync({
        id: stint.id,
        implementId: draft.implementId || null,
        driverUserId: draft.driverUserId || null,
      });
      setOpen(false);
    } catch {
      // The mutation error is shown in the dialog and the draft remains available to retry.
    }
  };
  return (
    <>
      <Button
        aria-label={`Edit implement and driver for ${stint.machineCode}`}
        onClick={() => {
          mutations.patch.reset();
          setDraft({ implementId: stint.implementId ?? '', driverUserId: stint.driverUserId ?? '' });
          setOpen(true);
        }}
        size="icon-sm"
        title="Edit implement and driver"
        type="button"
        variant="outline"
      >
        <IconPencil aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit assignment · {stint.machineCode}</DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="block space-y-1 text-sm" htmlFor={`implement-${stint.id}`}>
              <span>Implement</span>
              <SearchableCombobox
                inputId={`implement-${stint.id}`}
                onValueChange={(implementId) => setDraft((current) => ({ ...current, implementId }))}
                options={implementsForSelect}
                value={draft.implementId}
              />
            </label>
            <label className="block space-y-1 text-sm" htmlFor={`driver-${stint.id}`}>
              <span>Driver</span>
              <SearchableCombobox
                inputId={`driver-${stint.id}`}
                onValueChange={(driverUserId) => setDraft((current) => ({ ...current, driverUserId }))}
                options={driversForSelect}
                value={draft.driverUserId}
              />
            </label>
            <ErrorMessage error={mutations.patch.error} fallbackMessage="Unable to update Machine Assignment." />
            <DialogFooter>
              <DialogClose render={<Button disabled={mutations.patch.isPending} type="button" variant="outline" />}>
                Cancel
              </DialogClose>
              <Button disabled={!changed || mutations.patch.isPending} type="submit">
                Save assignment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
