import { ComboboxField } from '@/components/form/fields/ComboboxField.js';
import { useFieldContext } from '@/components/form/hooks/form-context.js';
import { usePartCategoryOptions } from '@/equipment/hooks/options/index.js';
import { NewPartCategoryButton } from './NewPartCategoryButton.js';

/** A Part's Part Category picker; render inside `<form.AppField name="categoryId">`. */
export function PartCategoryField() {
  const field = useFieldContext<string>();
  const categories = usePartCategoryOptions();

  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <ComboboxField
          disabled={categories.isPending}
          emptyMessage="No Part Categories found."
          label="Part Category"
          options={categories.selectOptions}
          placeholder={categories.isPending ? 'Loading Part Categories...' : 'Search Part Categories'}
        />
      </div>
      <NewPartCategoryButton onCreated={(category) => field.handleChange(category.id)} />
    </div>
  );
}
