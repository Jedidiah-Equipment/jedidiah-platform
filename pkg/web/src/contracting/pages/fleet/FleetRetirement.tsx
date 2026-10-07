import { FleetRetireInput } from '@pkg/schema/contracting';
import { IconArchive } from '@tabler/icons-react';
import { type UseMutationOptions, useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { Button } from '@/components/ui/button.js';
import { type MachineDialogSubject, MachineDialogTitle } from '@/contracting/components/MachineDialogTitle.js';
import { ReasonDialog } from '@/contracting/components/ReasonDialog.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';

const listRoutes = { machine: '/contracting/fleet', implement: '/contracting/fleet/implements' } as const;

type MutationFnOptions<TVariables> = Pick<
  UseMutationOptions<unknown, unknown, TVariables>,
  'mutationFn' | 'mutationKey'
>;

type FleetRetirementProps = {
  id: string;
  machine?: MachineDialogSubject;
  noun: keyof typeof listRoutes;
  /** Retirement locks the form, so unsaved edits must land first. */
  autosave: { flush: () => Promise<boolean> };
  retire: MutationFnOptions<FleetRetireInput>;
  remove: MutationFnOptions<{ id: string }>;
};

export function FleetRetirement({
  id,
  machine,
  noun,
  autosave,
  retire: retireOptions,
  remove: removeOptions,
}: FleetRetirementProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const showError = useApiMutationErrorToast();
  const { invalidateFleet } = useQueryInvalidation();
  const retire = useMutation({
    ...retireOptions,
    onSuccess: invalidateFleet,
    onError: (error) => showError(error, `Unable to retire ${noun}.`),
  });
  const remove = useMutation({
    ...removeOptions,
    onSuccess: async () => {
      await invalidateFleet();
      await navigate({ to: listRoutes[noun] });
    },
    onError: (error) => showError(error, `Unable to delete ${noun}.`),
  });
  return (
    <EntityActionsFooter>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <IconArchive data-icon="inline-start" />
        Retire {noun}
      </Button>
      <RemoveEntityButton
        title={machine ? <MachineDialogTitle machine={machine}>Delete {noun}</MachineDialogTitle> : `Delete ${noun}`}
        triggerLabel={`Delete ${noun}`}
        description={`Permanently delete this unused ${noun}. Entries with linked history must be retired instead.`}
        isPending={remove.isPending}
        onConfirm={() => remove.mutate({ id })}
      />
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={machine ? <MachineDialogTitle machine={machine}>Retire {noun}</MachineDialogTitle> : `Retire ${noun}`}
        description="Retirement is permanent. History remains available, and this entry is hidden from active fleet pickers."
        label="Retirement reason"
        submitLabel="Retire"
        schema={FleetRetireInput.shape.reason}
        submit={async (reason) => {
          if (!(await autosave.flush())) {
            const error = new Error('Resolve unsaved changes before retiring.');
            showError(error, `Unable to retire ${noun}.`);
            throw error;
          }
          return retire.mutateAsync({ id, reason });
        }}
      />
    </EntityActionsFooter>
  );
}
