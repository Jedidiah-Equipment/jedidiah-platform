import type { Product } from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { ProductAssembliesEditor } from './ProductAssembliesEditor.js';
import { ProductFormValues, toProductFormValues } from './types.js';

type ProductFormProps = {
  initialProduct?: Product;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductFormValues) => Promise<unknown>;
};

export const ProductForm: React.FC<ProductFormProps> = ({ initialProduct, isPending, submitLabel, onSubmit }) => {
  const defaultValues = toProductFormValues(initialProduct);

  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: ProductFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form.AppForm>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void form.handleSubmit();
        }}
      >
        <EditFormGrid>
          <EditFormFullWidth>
            <form.AppField name="thumbnailDataUrl">
              {(field) => (
                <field.ThumbnailField
                  fallbackLabel={form.state.values.modelCode || form.state.values.name || 'Product'}
                  label="Thumbnail"
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
            {(field) => <field.CheckboxField label="Requires VIN number" />}
          </form.AppField>
          <EditFormFullWidth>
            <form.AppField name="description">
              {(field) => <field.TextareaField label="Description" rows={4} />}
            </form.AppField>
          </EditFormFullWidth>
          <EditFormFullWidth>
            <form.Field name="assemblies" mode="array">
              {(assembliesField) => (
                <ProductAssembliesEditor assembliesField={assembliesField} currencyCode={defaultValues.currencyCode} />
              )}
            </form.Field>
          </EditFormFullWidth>
        </EditFormGrid>
        <EditFormActions className="mt-4">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button disabled={isSubmitting || isPending} type="submit">
                {isSubmitting || isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
                {submitLabel}
              </Button>
            )}
          </form.Subscribe>
        </EditFormActions>
      </form>
    </form.AppForm>
  );
};
