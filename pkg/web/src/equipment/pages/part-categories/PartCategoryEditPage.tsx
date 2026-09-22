import type { PartCategory } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';

import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartCategoryFormValues } from './types.js';

export function PartCategoryEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.partCategories.get.queryOptions({ id }));

  return (
    <PageLayout title={query.data?.name ?? 'Part Category'} description="Part Category details" size="md">
      <QueryContent query={query} errorMessage="Unable to load Part Category.">
        {(category) => <PartCategoryForm key={id} category={category} />}
      </QueryContent>
    </PageLayout>
  );
}

function PartCategoryForm({ category }: { category: PartCategory }) {
  const trpc = useTRPC();
  const { invalidatePartCategories } = useQueryInvalidation();
  const update = useMutation(trpc.partCategories.update.mutationOptions({ onSuccess: invalidatePartCategories }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: { name: category.name },
    failureMessage: 'Unable to rename Part Category.',
    validator: PartCategoryFormValues,
    toInput: (values) => ({ id: category.id, ...values }),
    save: (input) => update.mutateAsync(input),
  });

  return (
    <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={false}>
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
    </AutosaveFormCard>
  );
}
