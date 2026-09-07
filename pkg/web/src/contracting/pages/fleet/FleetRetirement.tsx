import { FleetRetireInput } from '@pkg/schema/contracting';
import { IconArchive } from '@tabler/icons-react';
import { useState } from 'react';
import { z } from 'zod';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

const RetirementValues = z.object({ reason: FleetRetireInput.shape.reason });
export function FleetRetirement({
  noun,
  retire,
  remove,
}: {
  noun: string;
  retire: (reason: string) => Promise<unknown>;
  remove: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const showError = useApiMutationErrorToast();
  return (
    <EntityActionsFooter>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IconArchive data-icon="inline-start" />
        Retire {noun}
      </Button>
      <RemoveEntityButton
        title={`Delete ${noun}`}
        triggerLabel={`Delete ${noun}`}
        description={`Permanently delete this unused ${noun}. Entries with linked history must be retired instead.`}
        isPending={removing}
        onConfirm={() => {
          setRemoving(true);
          void remove()
            .catch((error) => showError(error, `Unable to delete ${noun}.`))
            .finally(() => setRemoving(false));
        }}
      />
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title={`Retire ${noun}`}
        description="Retirement is permanent. History remains available, and this entry is hidden from active fleet pickers."
        submitLabel="Retire"
        defaultValues={{ reason: '' }}
        validator={RetirementValues}
        onCreate={async (values) => {
          try {
            return await retire(values.reason);
          } catch (error) {
            showError(error, `Unable to retire ${noun}.`);
            throw error;
          }
        }}
        onCreated={() => setOpen(false)}
      >
        {(form) => (
          <form.AppField name="reason">{(field) => <field.TextareaField label="Retirement reason" />}</form.AppField>
        )}
      </CreateEntityDialog>
    </EntityActionsFooter>
  );
}
