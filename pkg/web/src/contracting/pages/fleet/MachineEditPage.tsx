import type { Machine } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { categoryOptions } from './CategoryFields.js';
import { FleetRetirement } from './FleetRetirement.js';
import { MachineFormValues, machineFormValues, machinePatchInput } from './types.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';
export function MachineEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingFleet.machines.get.queryOptions({ id }));
  return (
    <PageLayout
      title={
        query.data ? (
          <CategoryLabel
            icon={query.data.categoryIcon}
            colour={query.data.categoryColour}
            name={query.data.code}
            size={24}
          />
        ) : (
          'Machine'
        )
      }
      description={query.data ? `${query.data.categoryName} · Machine details` : 'Machine details'}
      size="md"
    >
      <ErrorMessage error={query.error} fallbackMessage="Unable to load machine." />
      {query.data ? <MachineForm key={id} machine={query.data} /> : query.isPending ? <p>Loading machine…</p> : null}
    </PageLayout>
  );
}
function MachineForm({ machine }: { machine: Machine }) {
  const trpc = useTRPC();
  const invalidate = useFleetInvalidation();
  const navigate = useNavigate();
  const canEdit = useCan('contracting_machine:update').can && !machine.retiredAt;
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'machine' }));
  const options = useQuery(trpc.contractingFleet.machines.options.queryOptions());
  const patch = useMutation(trpc.contractingFleet.machines.patch.mutationOptions({ onSuccess: invalidate }));
  const retire = useMutation(trpc.contractingFleet.machines.retire.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(
    trpc.contractingFleet.machines.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/contracting/fleet' });
      },
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: machineFormValues(machine),
    failureMessage: 'Unable to update machine.',
    validator: MachineFormValues,
    toInput: (value) => machinePatchInput(machine.id, value),
    save: (value) => patch.mutateAsync(value),
  });
  const driverOptions = (options.data?.drivers ?? []).map((row) => ({ label: row.name, value: row.id }));
  if (machine.currentDriverUserId && !driverOptions.some((row) => row.value === machine.currentDriverUserId))
    driverOptions.push({
      label: machine.currentDriverName ?? 'Unavailable driver',
      value: machine.currentDriverUserId,
    });
  return (
    <>
      <ErrorMessage error={categories.error ?? options.error} fallbackMessage="Unable to load fleet options." />
      {machine.retiredAt ? <p className="mb-4 text-muted-foreground">Retired — {machine.retiredReason}</p> : null}
      <form {...formProps} className="flex flex-col gap-4">
        <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
        <Card>
          <CardContent>
            <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="code">{(field) => <field.TextField label="Code" />}</form.AppField>
              <form.AppField name="categoryId">
                {(field) => (
                  <field.SelectField
                    label="Category"
                    disabled={!canEdit}
                    options={categoryOptions(categories.data ?? [])}
                    onValueCommit={autosave.commit}
                  />
                )}
              </form.AppField>
              <form.AppField name="make">
                {(field) => (
                  <field.CreatableComboboxField label="Make" disabled={!canEdit} options={options.data?.makes ?? []} />
                )}
              </form.AppField>
              <form.AppField name="model">
                {(field) => (
                  <field.CreatableComboboxField
                    label="Model"
                    disabled={!canEdit}
                    options={options.data?.models ?? []}
                  />
                )}
              </form.AppField>
              <form.AppField name="year">{(field) => <field.NumberField label="Year" />}</form.AppField>
              <form.AppField name="registration">{(field) => <field.TextField label="Registration" />}</form.AppField>
              <form.AppField name="currentDriverUserId">
                {(field) => (
                  <field.SelectField
                    label="Current driver"
                    disabled={!canEdit}
                    emptyLabel="No driver"
                    options={driverOptions}
                    onValueCommit={autosave.commit}
                  />
                )}
              </form.AppField>
              <form.AppField name="serviceIntervalHours">
                {(field) => <field.NumberField label="Service interval (hours)" />}
              </form.AppField>
              <form.AppField name="nextServiceDueHours">
                {(field) => <field.NumberField label="Next service due (hours)" />}
              </form.AppField>
              <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
            </fieldset>
          </CardContent>
        </Card>
      </form>
      {canEdit ? (
        <FleetRetirement
          noun="machine"
          retire={async (reason) => {
            if (!(await autosave.flush())) throw new Error('Resolve unsaved changes before retiring.');
            return retire.mutateAsync({ id: machine.id, reason });
          }}
          remove={() => remove.mutateAsync({ id: machine.id })}
        />
      ) : null}
    </>
  );
}
