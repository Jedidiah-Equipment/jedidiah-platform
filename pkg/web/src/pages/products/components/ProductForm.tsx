import type { Product, ProductUpdateInput } from '@pkg/schema';
import type React from 'react';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { ProductAssembliesEditor } from './ProductAssembliesEditor.js';
import { ProductFormValues, toProductFormValues, toProductUpdateInput } from './types.js';

type ProductFormProps = {
  onSave: (value: ProductUpdateInput) => Promise<unknown>;
  product: Product;
};

export const ProductForm: React.FC<ProductFormProps> = ({ onSave, product }) => {
  const defaultValues = toProductFormValues(product);

  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues,
    failureMessage: 'Unable to update product.',
    save: onSave,
    toInput: (value) => toProductUpdateInput(product.id, value),
    validator: ProductFormValues,
  });

  const saveCommittedField = () => {
    autosave.markChanged();
    queueMicrotask(() => {
      void autosave.flush();
    });
  };

  return (
    <form.AppForm>
      <form {...formProps} className="flex flex-col gap-4">
        <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
        <EditFormGrid>
          <EditFormFullWidth>
            <form.AppField name="thumbnailDataUrl">
              {(field) => (
                <field.ThumbnailField
                  fallbackLabel={form.state.values.modelCode || form.state.values.name || 'Product'}
                  label="Thumbnail"
                  onValueCommit={saveCommittedField}
                />
              )}
            </form.AppField>
          </EditFormFullWidth>
          <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
          <form.AppField name="modelCode">
            {(field) => <field.TextField autoComplete="off" label="Model code" />}
          </form.AppField>
          <form.AppField name="basePrice">
            {(field) => (
              <field.CurrencyField
                autoComplete="off"
                currencyCode={defaultValues.currencyCode}
                label="Base price"
                placeholder="R120,000"
              />
            )}
          </form.AppField>
          <form.AppField name="buildTimeDays">
            {(field) => (
              <field.NumberField autoComplete="off" inputMode="numeric" label="Build time (days)" placeholder="14" />
            )}
          </form.AppField>
          <form.AppField name="requiresVinNumber">
            {(field) => <field.CheckboxField label="Requires VIN number" onValueCommit={saveCommittedField} />}
          </form.AppField>
          <EditFormFullWidth>
            <form.AppField name="description">
              {(field) => <field.TextareaField label="Description" rows={4} />}
            </form.AppField>
          </EditFormFullWidth>
          <EditFormFullWidth>
            <form.Field name="assemblies" mode="array">
              {(assembliesField) => (
                <ProductAssembliesEditor
                  assembliesField={assembliesField}
                  currencyCode={defaultValues.currencyCode}
                  onStructuralChange={saveCommittedField}
                />
              )}
            </form.Field>
          </EditFormFullWidth>
        </EditFormGrid>
      </form>
    </form.AppForm>
  );
};
