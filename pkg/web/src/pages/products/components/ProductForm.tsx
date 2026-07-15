import type { Product, ProductUpdateInput } from '@pkg/schema';
import type React from 'react';
import { useEffect, useState } from 'react';
import { BROCHURE_USAGE, FieldUsageLabel, LANDER_USAGE, PRODUCT_FIELD_USAGE } from '@/components/catalog/index.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Card, CardContent, CardDescription, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { TabsContent } from '@/components/ui/tabs.js';
import { useProductRangeVariantOptions } from '@/hooks/options/index.js';
import { useProductRangeOptions } from '@/hooks/options/use-product-range-options.js';
import { ProductAssembliesEditor } from './ProductAssembliesEditor.js';
import { ProductBaysEditor } from './ProductBaysEditor.js';
import { ProductKeyFeaturesEditor } from './ProductKeyFeaturesEditor.js';
import { ProductTechnicalDetailsEditor } from './ProductTechnicalDetailsEditor.js';
import { ProductFormValues, toProductFormValues, toProductUpdateInput } from './types.js';

type ProductFormProps = {
  detailsFooter?: React.ReactNode;
  onSave: (value: ProductUpdateInput) => Promise<unknown>;
  product: Product;
};

export const ProductForm: React.FC<ProductFormProps> = ({ detailsFooter, onSave, product }) => {
  const defaultValues = toProductFormValues(product);
  const [selectedRangeId, setSelectedRangeId] = useState(defaultValues.rangeId);
  const productRangeOptions = useProductRangeOptions();
  const productRangeVariantOptions = useProductRangeVariantOptions(selectedRangeId);

  useEffect(() => {
    setSelectedRangeId(defaultValues.rangeId);
  }, [defaultValues.rangeId]);

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
                    {(field) => (
                      <field.TextField
                        autoComplete="off"
                        label={<FieldUsageLabel usage={PRODUCT_FIELD_USAGE.name}>Name</FieldUsageLabel>}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="nameHighlight">
                    {(field) => (
                      <field.TextField
                        autoComplete="off"
                        label={
                          <FieldUsageLabel usage={PRODUCT_FIELD_USAGE.nameHighlight}>Name highlight</FieldUsageLabel>
                        }
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="rangeId">
                    {(field) => (
                      <field.SelectField
                        disabled={productRangeOptions.isPending}
                        label={<FieldUsageLabel usage={PRODUCT_FIELD_USAGE.rangeId}>Range</FieldUsageLabel>}
                        onValueCommit={(rangeId) => {
                          setSelectedRangeId(rangeId);
                          form.setFieldValue('variantId', '');
                          saveCommittedField();
                        }}
                        options={productRangeOptions.selectOptions}
                        placeholder={productRangeOptions.isPending ? 'Loading ranges...' : 'Select range'}
                      />
                    )}
                  </form.AppField>
                  {selectedRangeId &&
                  (productRangeVariantOptions.isPending || productRangeVariantOptions.selectOptions.length > 0) ? (
                    <form.AppField name="variantId">
                      {(field) => (
                        <field.SelectField
                          disabled={productRangeVariantOptions.isPending}
                          emptyLabel="No Variant"
                          label="Range Variant"
                          onValueCommit={saveCommittedField}
                          options={productRangeVariantOptions.selectOptions}
                          placeholder={productRangeVariantOptions.isPending ? 'Loading variants...' : 'Select variant'}
                        />
                      )}
                    </form.AppField>
                  ) : null}
                  <form.AppField name="modelCode">
                    {(field) => (
                      <field.TextField
                        autoComplete="off"
                        label={<FieldUsageLabel usage={PRODUCT_FIELD_USAGE.modelCode}>Model code</FieldUsageLabel>}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="displayOrder">
                    {(field) => (
                      <field.NumberField
                        autoComplete="off"
                        inputMode="numeric"
                        label="Display order"
                        placeholder="0"
                        step={1}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="category">
                    {(field) => (
                      <field.TextField
                        autoComplete="off"
                        label={<FieldUsageLabel usage={PRODUCT_FIELD_USAGE.category}>Category</FieldUsageLabel>}
                        placeholder="Silage & Grain"
                      />
                    )}
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
                    {(field) => <field.SwitchField label="Requires VIN number" onValueCommit={saveCommittedField} />}
                  </form.AppField>
                  <EditFormFullWidth>
                    <form.AppField name="description">
                      {(field) => (
                        <field.TextareaField
                          label={<FieldUsageLabel usage={PRODUCT_FIELD_USAGE.description}>Description</FieldUsageLabel>}
                          rows={4}
                        />
                      )}
                    </form.AppField>
                  </EditFormFullWidth>
                </EditFormGrid>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Publishing</CardTitle>
                <CardDescription>
                  Switch these on to publish once the Brochure and Lander checklists are complete.
                </CardDescription>
              </CardHeader>
              <CardSeparator />
              <CardContent>
                <EditFormGrid>
                  <form.AppField name="landerEnabled">
                    {(field) => (
                      <field.SwitchField
                        label={<FieldUsageLabel usage={LANDER_USAGE}>Lander enabled</FieldUsageLabel>}
                        onValueCommit={saveCommittedField}
                      />
                    )}
                  </form.AppField>
                  <form.AppField name="brochureEnabled">
                    {(field) => (
                      <field.SwitchField
                        label={<FieldUsageLabel usage={BROCHURE_USAGE}>Brochure enabled</FieldUsageLabel>}
                        onValueCommit={saveCommittedField}
                      />
                    )}
                  </form.AppField>
                </EditFormGrid>
              </CardContent>
            </Card>
            <form.Field name="keyFeatures" mode="array">
              {(keyFeaturesField) => (
                <ProductKeyFeaturesEditor keyFeaturesField={keyFeaturesField} onStructuralChange={saveCommittedField} />
              )}
            </form.Field>
            <form.Field name="technicalDetails" mode="array">
              {(technicalDetailsField) => (
                <ProductTechnicalDetailsEditor
                  onStructuralChange={saveCommittedField}
                  technicalDetailsField={technicalDetailsField}
                />
              )}
            </form.Field>
            {detailsFooter}
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
      </form>
    </form.AppForm>
  );
};
