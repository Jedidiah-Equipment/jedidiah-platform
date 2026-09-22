import type { PartCategory } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';

import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { MergePartCategoriesDialog } from './MergePartCategoriesDialog.js';
import { PartCategoryFormValues, partCategoryFormToInput, partCategoryFormValues } from './types.js';

export function PartCategoryEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const query = useQuery(trpc.partCategories.get.queryOptions({ id }));

  return (
    <PageLayout title={query.data?.name ?? 'Part Category'} description="Part Category details" size="md">
      <QueryContent query={query} errorMessage="Unable to load Part Category.">
        {(category) => (
          <>
            <PartCategoryForm key={id} category={category} />
            <EntityActionsFooter>
              <MergePartCategoriesDialog
                initialSourceId={category.id}
                key={category.id}
                onMerged={(survivor) =>
                  navigate({ to: '/equipment/part-categories/$id/edit', params: { id: survivor.id } })
                }
                triggerLabel="Merge into…"
              />
            </EntityActionsFooter>
          </>
        )}
      </QueryContent>
    </PageLayout>
  );
}

function PartCategoryForm({ category }: { category: PartCategory }) {
  const trpc = useTRPC();
  const { invalidatePartCategories } = useQueryInvalidation();
  const update = useMutation(
    trpc.partCategories.update.mutationOptions({
      onSuccess: (updated) => invalidatePartCategories({ nameChanged: updated.name !== category.name }),
    }),
  );
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: partCategoryFormValues(category),
    failureMessage: 'Unable to save Part Category.',
    validator: PartCategoryFormValues,
    toInput: (values) => partCategoryFormToInput(category.id, values),
    save: (input) => update.mutateAsync(input),
  });

  return (
    <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={false}>
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
      <form.AppField name="markupPercent">
        {(field) => (
          <field.NumberField
            label="Markup (%)"
            placeholder="Not set"
            description="Added to a Part's average cost when it is picked onto a Quote. Leave blank until you have decided one: a blank category offers no price."
          />
        )}
      </form.AppField>
    </AutosaveFormCard>
  );
}
