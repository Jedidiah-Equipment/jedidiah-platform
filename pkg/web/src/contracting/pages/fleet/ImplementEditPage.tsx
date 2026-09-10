import type { Implement } from '@pkg/schema/contracting';
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
import { ImplementFormValues, implementFormValues, implementPatchInput } from './types.js';
import { useFleetInvalidation } from './use-fleet-invalidation.js';
export function ImplementEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingFleet.implements.get.queryOptions({ id }));
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
          'Implement'
        )
      }
      description={query.data ? `${query.data.categoryName} · Implement details` : 'Implement details'}
      size="md"
    >
      <ErrorMessage error={query.error} fallbackMessage="Unable to load implement." />
      {query.data ? (
        <ImplementForm key={id} implement={query.data} />
      ) : query.isPending ? (
        <p>Loading implement…</p>
      ) : null}
    </PageLayout>
  );
}
function ImplementForm({ implement }: { implement: Implement }) {
  const trpc = useTRPC();
  const invalidate = useFleetInvalidation();
  const navigate = useNavigate();
  const canEdit = useCan('contracting_machine:update').can && !implement.retiredAt;
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'implement' }));
  const patch = useMutation(trpc.contractingFleet.implements.patch.mutationOptions({ onSuccess: invalidate }));
  const retire = useMutation(trpc.contractingFleet.implements.retire.mutationOptions({ onSuccess: invalidate }));
  const remove = useMutation(
    trpc.contractingFleet.implements.remove.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await navigate({ to: '/contracting/fleet/implements' });
      },
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: implementFormValues(implement),
    failureMessage: 'Unable to update implement.',
    validator: ImplementFormValues,
    toInput: (value) => implementPatchInput(implement.id, value),
    save: (value) => patch.mutateAsync(value),
  });
  return (
    <>
      <ErrorMessage error={categories.error} fallbackMessage="Unable to load categories." />
      {implement.retiredAt ? <p className="mb-4 text-muted-foreground">Retired — {implement.retiredReason}</p> : null}
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
              <div className="sm:col-span-2">
                <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
              </div>
            </fieldset>
          </CardContent>
        </Card>
      </form>
      {canEdit ? (
        <FleetRetirement
          noun="implement"
          retire={async (reason) => {
            if (!(await autosave.flush())) throw new Error('Resolve unsaved changes before retiring.');
            return retire.mutateAsync({ id: implement.id, reason });
          }}
          remove={() => remove.mutateAsync({ id: implement.id })}
        />
      ) : null}
    </>
  );
}
