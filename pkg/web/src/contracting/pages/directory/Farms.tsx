import { type Farm, FarmName } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { AutosaveStatus, CreateEntityDialog, useAutosaveForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { DirectoryTable } from './DirectoryTable.js';
import { useDirectoryInvalidation } from './use-directory-invalidation.js';

const FarmFormValues = z.object({ name: FarmName });
export function Farms({ customerId }: { customerId: string }) {
  const trpc = useTRPC();
  const invalidate = useDirectoryInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_directory:update').can;
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery(trpc.contractingDirectory.farms.list.queryOptions({ customerId }));
  const selected = query.data?.find((farm) => farm.id === selectedId);
  const columns = useMemo<DataTableColumnDef<Farm>[]>(
    () => [{ accessorKey: 'name', header: 'Farm', enableSorting: true }],
    [],
  );
  const create = useMutation(
    trpc.contractingDirectory.farms.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create farm.'),
    }),
  );
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Farms</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ErrorMessage error={query.error} fallbackMessage="Unable to load farms." />
        <DirectoryTable
          rows={query.data ?? []}
          columns={columns}
          loading={query.isPending}
          onOpen={(farm) => setSelectedId(farm.id)}
          searchPlaceholder="Search farms…"
          controls={canEdit ? <Button onClick={() => setOpen(true)}>New farm</Button> : undefined}
        />
        {selected ? <FarmForm key={selected.id} farm={selected} onClose={() => setSelectedId(null)} /> : null}
      </CardContent>
      <CreateEntityDialog
        key={open ? 'open' : 'closed'}
        open={open}
        onOpenChange={setOpen}
        title="New farm"
        defaultValues={{ name: '' }}
        validator={FarmFormValues}
        onCreate={(values) => create.mutateAsync({ customerId, ...values })}
        onCreated={async (farm) => {
          await invalidate();
          setOpen(false);
          setSelectedId(farm.id);
        }}
      >
        {(form) => <form.AppField name="name">{(field) => <field.TextField label="Farm name" />}</form.AppField>}
      </CreateEntityDialog>
    </Card>
  );
}
function FarmForm({ farm, onClose }: { farm: Farm; onClose: () => void }) {
  const trpc = useTRPC();
  const invalidate = useDirectoryInvalidation();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_directory:update').can;
  const patch = useMutation(trpc.contractingDirectory.farms.patch.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(
    trpc.contractingDirectory.farms.remove.mutationOptions({
      onSuccess: async () => {
        onClose();
        await invalidate();
      },
      onError: (error) => showError(error, 'Unable to delete farm.'),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { name: farm.name },
    validator: FarmFormValues,
    failureMessage: 'Unable to update farm.',
    toInput: (values) => ({ id: farm.id, customerId: farm.customerId, ...values }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <Dialog
      open
      onOpenChange={async (open) => {
        if (!open && (await autosave.flush())) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit farm</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <form {...formProps} className="grid gap-4">
            <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
            <fieldset disabled={!canEdit}>
              <form.AppField name="name">{(field) => <field.TextField label="Farm name" />}</form.AppField>
            </fieldset>
          </form>
          {canEdit ? (
            <RemoveEntityButton
              title="Delete farm"
              triggerLabel="Delete farm"
              description={`Delete ${farm.name}? Farms referenced by other records cannot be deleted.`}
              isPending={remove.isPending}
              onConfirm={() => remove.mutate({ id: farm.id, customerId: farm.customerId })}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
