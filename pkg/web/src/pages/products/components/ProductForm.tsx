import type { Product, ProductUpdateInput } from '@pkg/schema';
import type React from 'react';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { TabsContent } from '@/components/ui/tabs.js';
import { ProductAssembliesEditor } from './ProductAssembliesEditor.js';
import { ProductBaysEditor } from './ProductBaysEditor.js';
import { ProductBrochureEditor } from './ProductBrochureEditor.js';
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
    // Structural array edits need their newly added fields mounted before form validation can attach field errors.
    setTimeout(() => {
      void autosave.flush();
    }, 0);
  };

  return (
    <form.AppForm>
      {/* Documents owns an upload form, so only editable Product panels live inside this DOM form. */}
      <form {...formProps} className="contents">
        <TabsContent className="pt-4" value="details">
          <div className="flex flex-col gap-4">
            <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
            <Card>
              <CardContent>
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
                  <form.AppField name="name">
                    {(field) => <field.TextField autoComplete="off" label="Name" />}
                  </form.AppField>
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
                      <field.NumberField
                        autoComplete="off"
                        inputMode="numeric"
                        label="Build time (days)"
                        placeholder="14"
                      />
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
                </EditFormGrid>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent className="pt-4" value="bays">
          <div className="flex flex-col gap-4">
            <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
            <form.Field name="productBays" mode="array">
              {(productBaysField) => (
                <ProductBaysEditor
                  onStructuralChange={saveCommittedField}
                  productBays={product.productBays}
                  productBaysField={productBaysField}
                />
              )}
            </form.Field>
          </div>
        </TabsContent>
        <TabsContent className="pt-4" value="assemblies">
          <div className="flex flex-col gap-4">
            <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
            <form.Field name="assemblies" mode="array">
              {(assembliesField) => (
                <ProductAssembliesEditor
                  assembliesField={assembliesField}
                  currencyCode={defaultValues.currencyCode}
                  onStructuralChange={saveCommittedField}
                />
              )}
            </form.Field>
          </div>
        </TabsContent>
        <TabsContent className="pt-4" value="brochure">
          <div className="flex flex-col gap-4">
            <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
            <form.Field name="brochureConfig.keyFeatures" mode="array">
              {(keyFeaturesField) => (
                <ProductBrochureEditor
                  images={product.brochureConfig.images}
                  keyFeaturesField={keyFeaturesField}
                  onStructuralChange={saveCommittedField}
                  productId={product.id}
                />
              )}
            </form.Field>
          </div>
        </TabsContent>
      </form>
    </form.AppForm>
  );
};
