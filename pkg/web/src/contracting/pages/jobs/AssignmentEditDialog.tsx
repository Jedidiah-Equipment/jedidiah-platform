import type { Assignment } from '@pkg/schema/contracting';
import { IconPencil } from '@tabler/icons-react';
import { useId, useState } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox, type SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { Button } from '@/components/ui/button.js';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { useMachines } from './machines-context.js';

export function AssignmentEditDialog({ stint }: { stint: Assignment }) {
  const { implementOptions, drivers, mutations } = useMachines();
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
      error={mutations.patch.error}
      isPending={mutations.patch.isPending}
      onStart={() => mutations.patch.reset()}
      onSave={async (draft) => {
        await mutations.patch.mutateAsync({
          id: stint.id,
          implementId: draft.implementId || null,
          driverUserId: draft.driverUserId || null,
        });
      }}
    />
  );
}

type AssignmentDraft = { implementId: string; driverUserId: string };

/** The same editor either saves an assignment or applies it to an arrival's pending form values. */
export function AssignmentEditorDialog({
  stint,
  implementOptions,
  driverOptions,
  onSave,
  onStart,
  error,
  isPending = false,
  canSave = true,
  submitLabel = 'Save assignment',
}: {
  stint: Assignment;
  implementOptions: readonly SearchableComboboxOption[];
  driverOptions: readonly SearchableComboboxOption[];
  onSave: (draft: AssignmentDraft) => Promise<void>;
  onStart?: () => void;
  error?: unknown;
  isPending?: boolean;
  canSave?: boolean;
  submitLabel?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AssignmentDraft>({
    implementId: stint.implementId ?? '',
    driverUserId: stint.driverUserId ?? '',
  });
  const changed = draft.implementId !== (stint.implementId ?? '') || draft.driverUserId !== (stint.driverUserId ?? '');
  const save = async () => {
    if (!changed || !canSave || isPending) return;
    try {
      await onSave(draft);
      setOpen(false);
    } catch {
      // The caller presents the error; keep the draft available for retry.
    }
  };
  return (
    <>
      <Button
        aria-label={`Edit implement and driver for ${stint.machineCode}`}
        onClick={() => {
          onStart?.();
          setDraft({ implementId: stint.implementId ?? '', driverUserId: stint.driverUserId ?? '' });
          setOpen(true);
        }}
        size="icon-sm"
        title="Edit implement and driver"
        type="button"
        variant="ghost"
      >
        <IconPencil aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <MachineDialogTitle machine={stint}>Edit assignment</MachineDialogTitle>
            </DialogTitle>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void save();
            }}
          >
            <label className="block space-y-1 text-sm" htmlFor={`implement-${id}`}>
              <span>Implement</span>
              <SearchableCombobox
                inputId={`implement-${id}`}
                onValueChange={(implementId) => setDraft((current) => ({ ...current, implementId }))}
                options={implementOptions}
                value={draft.implementId}
                disabled={isPending}
              />
            </label>
            <label className="block space-y-1 text-sm" htmlFor={`driver-${id}`}>
              <span>Driver</span>
              <SearchableCombobox
                inputId={`driver-${id}`}
                onValueChange={(driverUserId) => setDraft((current) => ({ ...current, driverUserId }))}
                options={driverOptions}
                value={draft.driverUserId}
                disabled={isPending}
              />
            </label>
            <ErrorMessage error={error} fallbackMessage="Unable to update Machine Assignment." />
            <DialogFooter>
              <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
              <Button disabled={!changed || !canSave || isPending} type="submit">
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
