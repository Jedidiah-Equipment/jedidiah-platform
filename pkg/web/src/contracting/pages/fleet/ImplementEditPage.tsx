import type { Implement } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CategoryPickerField } from './CategoryFields.js';
import { FleetRetirement } from './FleetRetirement.js';
import { ImplementFormValues, implementFormValues, implementPatchInput } from './types.js';

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
      <QueryContent query={query} errorMessage="Unable to load implement.">
        {(implement) => <ImplementForm key={id} implement={implement} />}
      </QueryContent>
    </PageLayout>
  );
}
function ImplementForm({ implement }: { implement: Implement }) {
  const trpc = useTRPC();
  const { invalidateFleet } = useQueryInvalidation();
  const canEdit = useCan('contracting_machine:update').can && !implement.retiredAt;
  const categories = useQuery(trpc.contractingFleet.categories.list.queryOptions({ kind: 'implement' }));
  const patch = useMutation(trpc.contractingFleet.implements.patch.mutationOptions({ onSuccess: invalidateFleet }));
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
      <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={!canEdit}>
        <form.AppField name="code">{(field) => <field.TextField label="Code" />}</form.AppField>
        <form.AppField name="categoryId">
          {() => (
            <CategoryPickerField
              disabled={!canEdit}
              categories={categories.data ?? []}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <EditFormFullWidth>
          <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" />}</form.AppField>
        </EditFormFullWidth>
      </AutosaveFormCard>
      {canEdit ? (
        <FleetRetirement
          id={implement.id}
          noun="implement"
          autosave={autosave}
          retire={trpc.contractingFleet.implements.retire.mutationOptions()}
          remove={trpc.contractingFleet.implements.remove.mutationOptions()}
        />
      ) : null}
    </>
  );
}
