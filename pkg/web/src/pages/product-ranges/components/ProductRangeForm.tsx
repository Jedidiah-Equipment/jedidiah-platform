import type { ProductRange, ProductRangeUpdateInput } from '@pkg/schema';
import type React from 'react';

import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { RangeImageUpload } from './RangeImageUpload.js';
import { ProductRangeFormValues, toProductRangeFormValues, toProductRangeUpdateInput } from './types.js';

type ProductRangeFormProps = {
  canEdit: boolean;
  onSave: (value: ProductRangeUpdateInput) => Promise<unknown>;
  range: ProductRange;
};

export const ProductRangeForm: React.FC<ProductRangeFormProps> = ({ canEdit, onSave, range }) => {
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toProductRangeFormValues(range),
    failureMessage: 'Unable to update Product Range.',
    save: onSave,
    toInput: (value) => toProductRangeUpdateInput(range.id, value),
    validator: ProductRangeFormValues,
  });

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
      <EditFormGrid>
        <form.AppField name="name">
          {(field) => <field.TextField autoComplete="off" disabled={!canEdit} label="Name" />}
        </form.AppField>
        <EditFormFullWidth>
          <RangeImageUpload canEdit={canEdit} image={range.image} rangeId={range.id} />
        </EditFormFullWidth>
      </EditFormGrid>
    </form>
  );
};
