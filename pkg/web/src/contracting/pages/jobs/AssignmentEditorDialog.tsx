import type { Assignment } from '@pkg/schema/contracting';
import { IconPencil } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { CreateEntityDialog } from '@/components/form/CreateEntityDialog.js';
import { Button } from '@/components/ui/button.js';
import { MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';

const AssignmentDraft = z.object({ implementId: z.string(), driverUserId: z.string() });
export type AssignmentDraft = z.infer<typeof AssignmentDraft>;

/** Whether a draft names a different Implement or Driver than the Machine Assignment holds. */
export const changesAssignment = (
  stint: Pick<Assignment, 'implementId' | 'driverUserId'> | null,
  draft: AssignmentDraft,
) => draft.implementId !== (stint?.implementId ?? '') || draft.driverUserId !== (stint?.driverUserId ?? '');

/** The same editor either saves an assignment or applies it to an arrival's pending form values. */
export function AssignmentEditorDialog({
  stint,
  implementOptions,
  driverOptions,
  onSave,
  onStart,
  error,
  canSave = true,
  submitLabel = 'Save assignment',
}: {
  stint: Assignment;
  implementOptions: readonly SearchableComboboxOption[];
  driverOptions: readonly SearchableComboboxOption[];
  onSave: (draft: AssignmentDraft) => Promise<void>;
  onStart?: () => void;
  error?: unknown;
  canSave?: boolean;
  submitLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        aria-label={`Edit implement and driver for ${stint.machineCode}`}
        onClick={() => {
          onStart?.();
          setOpen(true);
        }}
        size="icon-sm"
        title="Edit implement and driver"
        type="button"
        variant="ghost"
      >
        <IconPencil aria-hidden="true" />
      </Button>
      <CreateEntityDialog
        open={open}
        onOpenChange={setOpen}
        title={<MachineDialogTitle machine={stint}>Edit assignment</MachineDialogTitle>}
        defaultValues={{ implementId: stint.implementId ?? '', driverUserId: stint.driverUserId ?? '' }}
        validator={AssignmentDraft}
        canSubmit={(draft) => canSave && changesAssignment(stint, draft)}
        submitLabel={submitLabel}
        onCreate={async (draft) => {
          await onSave(draft);
          return true;
        }}
        onCreated={() => setOpen(false)}
      >
        {(form) => (
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <>
                <form.AppField name="implementId">
                  {(field) => (
                    <field.ComboboxField label="Implement" options={implementOptions} disabled={isSubmitting} />
                  )}
                </form.AppField>
                <form.AppField name="driverUserId">
                  {(field) => <field.ComboboxField label="Driver" options={driverOptions} disabled={isSubmitting} />}
                </form.AppField>
                <ErrorMessage error={error} fallbackMessage="Unable to update Machine Assignment." />
              </>
            )}
          </form.Subscribe>
        )}
      </CreateEntityDialog>
    </>
  );
}
