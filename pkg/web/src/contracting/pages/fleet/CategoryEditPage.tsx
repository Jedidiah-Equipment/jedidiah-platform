import { type Category, FleetName, PresetRate } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';

const CategoryFormValues = z.object({ name: FleetName, presetRate: PresetRate });
export function CategoryEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingFleet.categories.get.queryOptions({ id }));
  return (
    <PageLayout title={query.data?.name ?? 'Category'} description="Category details" size="md">
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
  const canReadRate = useCan('contracting_rate:read').can;
  const canEditRate = useCan('contracting_rate:update').can;
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
    defaultValues: { name: category.name, presetRate: category.presetRate ?? 0 },
    failureMessage: 'Unable to update category.',
    validator: CategoryFormValues,
    toInput: (value) => ({
      id: category.id,
      name: value.name,
      ...(canEditRate ? { presetRate: value.presetRate } : {}),
    }),
    save: (value) => patch.mutateAsync(value),
  });
  return (
    <>
      <form {...formProps} className="flex flex-col gap-4">
        <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
        <Card>
          <CardContent>
            <fieldset disabled={!canEdit} className="grid gap-4">
              <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
              {canReadRate ? (
                <form.AppField name="presetRate">
                  {(field) => (
                    <field.CurrencyField label="Preset rate (R/hour)" currencyCode="ZAR" disabled={!canEditRate} />
                  )}
                </form.AppField>
              ) : null}
            </fieldset>
          </CardContent>
        </Card>
      </form>
      {canEdit ? (
        <EntityActionsFooter>
          <RemoveEntityButton
            title="Delete category"
            triggerLabel="Delete category"
            description="Only categories with no linked Machines can be deleted."
            isPending={remove.isPending}
            onConfirm={() => remove.mutate({ id: category.id })}
          />
        </EntityActionsFooter>
      ) : null}
    </>
  );
}
