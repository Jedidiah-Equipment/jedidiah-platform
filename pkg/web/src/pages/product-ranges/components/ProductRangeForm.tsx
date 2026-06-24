import type { ProductRange, ProductRangeUpdateInput } from '@pkg/schema';
import type React from 'react';

import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { FieldUsageLabel, PRODUCT_RANGE_FIELD_USAGE } from '@/pages/catalog-content-usage.js';
import { RangeImageUpload } from './RangeImageUpload.js';
import { RangeLogoUpload } from './RangeLogoUpload.js';
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
      <Card>
        <CardContent>
          <EditFormGrid>
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  autoComplete="off"
                  disabled={!canEdit}
                  label={<FieldUsageLabel usage={PRODUCT_RANGE_FIELD_USAGE.name}>Name</FieldUsageLabel>}
                />
              )}
            </form.AppField>
            <EditFormFullWidth>
              <form.AppField name="description">
                {(field) => (
                  <field.TextareaField
                    disabled={!canEdit}
                    label={<FieldUsageLabel usage={PRODUCT_RANGE_FIELD_USAGE.description}>Description</FieldUsageLabel>}
                    placeholder="Short marketing blurb shown on the public site."
                    rows={4}
                  />
                )}
              </form.AppField>
            </EditFormFullWidth>
            <EditFormFullWidth>
              <div className="grid gap-4 md:grid-cols-2">
                <RangeImageUpload canEdit={canEdit} image={range.image} rangeId={range.id} />
                <RangeLogoUpload canEdit={canEdit} logo={range.logo} rangeId={range.id} />
              </div>
            </EditFormFullWidth>
          </EditFormGrid>
        </CardContent>
      </Card>
    </form>
  );
};
