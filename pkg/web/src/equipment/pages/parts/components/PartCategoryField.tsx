import { PartCategoryName, partCategoryLookupKey } from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';

import { ComboboxField } from '@/components/form/fields/ComboboxField.js';
import { usePartCategoryOptions } from '@/equipment/hooks/options/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

/** A Part's Part Category picker; render inside `<form.AppField name="categoryId">`. */
export function PartCategoryField() {
  const trpc = useTRPC();
  const categories = usePartCategoryOptions();
  const canCreate = useCan('equipment_part_category:update').can;
  const { invalidatePartCategories } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const create = useMutation(
    trpc.partCategories.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Part Category.'),
    }),
  );
  const placeholder = categories.isPending ? 'Loading Part Categories...' : 'Search Part Categories';

  return (
    <ComboboxField
      create={
        canCreate
          ? {
              lookupKey: partCategoryLookupKey,
              onCreate: async (name) => {
                const category = await create.mutateAsync({ name }).catch(() => undefined);
                if (!category) return undefined;

                // The new option has to be in the list before the field points at it, or the input shows blank.
                await invalidatePartCategories();
                return category.id;
              },
              toName: (inputValue) => PartCategoryName.safeParse(inputValue).data,
            }
          : undefined
      }
      disabled={categories.isPending}
      emptyMessage="No Part Categories found."
      label="Part Category"
      options={categories.selectOptions}
      placeholder={canCreate ? `${placeholder} or type a new one` : placeholder}
    />
  );
}
