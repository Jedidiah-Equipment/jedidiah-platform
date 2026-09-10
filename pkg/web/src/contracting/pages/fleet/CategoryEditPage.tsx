import { type Category, CategoryColour, CategoryIconKey, CategoryKind, FleetName } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CategoryColourField, CategoryIconField, categoryKindOptions, iconAfterKindChange } from './CategoryFields.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';

const CategoryFormValues = z.object({
  name: FleetName,
  kind: CategoryKind,
  icon: CategoryIconKey,
  colour: CategoryColour,
});
export function CategoryEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingFleet.categories.get.queryOptions({ id }));
  return (
    <PageLayout
      title={
        query.data ? (
          <CategoryLabel icon={query.data.icon} colour={query.data.colour} name={query.data.name} size={24} />
        ) : (
          'Category'
        )
      }
      description="Category details"
      size="md"
    >
      <ErrorMessage error={query.error} fallbackMessage="Unable to load category." />
      {query.data ? <CategoryForm key={id} category={query.data} /> : query.isPending ? <p>Loading category…</p> : null}
    </PageLayout>
  );
}
function CategoryForm({ category }: { category: Category }) {
  const trpc = useTRPC();
  const invalidate = useFleetInvalidation();
  const navigate = useNavigate();
  const showError = useApiMutationErrorToast();
  const canEdit = useCan('contracting_machine:update').can;
  const patch = useMutation(trpc.contractingFleet.categories.patch.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(
    trpc.contractingFleet.categories.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/contracting/fleet/categories' });
      },
      onError: (error) => showError(error, 'Unable to delete category.'),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { name: category.name, kind: category.kind, icon: category.icon, colour: category.colour },
    failureMessage: 'Unable to update category.',
    validator: CategoryFormValues,
    toInput: (value) => ({ id: category.id, ...value }),
    save: (value) => patch.mutateAsync(value),
  });
  return (
    <>
      <form {...formProps} className="flex flex-col gap-4">
        <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
        <Card>
          <CardContent>
            <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
              <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
              <form.AppField name="kind">
                {(field) => (
                  <field.SelectField
                    label="Kind"
                    disabled={!canEdit || category.inUse}
                    description={
                      category.inUse ? 'Move its Machines or Implements elsewhere before changing the kind.' : undefined
                    }
                    options={categoryKindOptions}
                    onValueCommit={(value) => {
                      if (value === 'machine' || value === 'implement')
                        form.setFieldValue('icon', iconAfterKindChange(value, form.getFieldValue('icon')));
                      autosave.commit();
                    }}
                  />
                )}
              </form.AppField>
              <form.Subscribe selector={(state) => [state.values.icon, state.values.colour] as const}>
                {([icon, colour]) => (
                  <>
                    <form.AppField name="icon">
                      {() => <CategoryIconField colour={colour} disabled={!canEdit} onValueCommit={autosave.commit} />}
                    </form.AppField>
                    <form.AppField name="colour">
                      {() => <CategoryColourField icon={icon} disabled={!canEdit} onValueCommit={autosave.commit} />}
                    </form.AppField>
                  </>
                )}
              </form.Subscribe>
            </fieldset>
          </CardContent>
        </Card>
      </form>
      {canEdit ? (
        <EntityActionsFooter>
          <RemoveEntityButton
            title="Delete category"
            triggerLabel="Delete category"
            description="Only categories with no linked Machines or Implements can be deleted."
            isPending={remove.isPending}
            onConfirm={() => remove.mutate({ id: category.id })}
          />
        </EntityActionsFooter>
      ) : null}
    </>
  );
}
