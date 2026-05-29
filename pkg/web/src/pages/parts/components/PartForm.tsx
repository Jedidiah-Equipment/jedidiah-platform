import type { Part, Supplier } from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';

import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { usePartCategoryOptions, useSupplierOptions } from '@/hooks/options/index.js';
import { PartFormValues, partUnitOfMeasureOptions, toPartFormValues } from './types.js';

type PartFormProps = {
  fixedSupplier?: Pick<Supplier, 'companyName' | 'id'>;
  initialPart?: Part;
  isPending: boolean;
  onSubmit: (value: PartFormValues) => Promise<unknown>;
  submitLabel: string;
};

export const PartForm: React.FC<PartFormProps> = ({ fixedSupplier, initialPart, isPending, onSubmit, submitLabel }) => {
  const supplierOptions = useSupplierOptions({ enabled: !fixedSupplier, pageSize: 0 });
  const isSupplierSelectPending = !fixedSupplier && supplierOptions.isPending;
  const categoryOptions = usePartCategoryOptions();

  const form = useAppForm({
    defaultValues: toPartFormValues({ fixedSupplierId: fixedSupplier?.id, initialPart }),
    validators: {
      onSubmit: PartFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <EditFormGrid>
        <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
        <form.AppField name="code">{(field) => <field.TextField autoComplete="off" label="Code" />}</form.AppField>
        <form.AppField name="drawingCode">
          {(field) => <field.TextField autoComplete="off" label="Drawing code" />}
        </form.AppField>
        <form.AppField name="finish">{(field) => <field.TextField autoComplete="off" label="Finish" />}</form.AppField>
        {fixedSupplier ? null : (
          <form.AppField name="supplierId">
            {(field) => (
              <field.SelectField
                disabled={isSupplierSelectPending}
                label="Supplier"
                options={supplierOptions.selectOptions}
                placeholder={isSupplierSelectPending ? 'Loading suppliers...' : 'Select supplier'}
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="supplierCode">
          {(field) => <field.TextField autoComplete="off" label="Supplier code" />}
        </form.AppField>
        <form.AppField name="unitOfMeasure">
          {(field) => <field.SelectField label="Unit" options={partUnitOfMeasureOptions} placeholder="Select unit" />}
        </form.AppField>
        <form.AppField name="isInternallyFabricated">
          {(field) => <field.CheckboxField label="Internally fabricated" />}
        </form.AppField>
        <form.AppField name="category">
          {(field) => (
            <field.CreatableComboboxField
              disabled={categoryOptions.isPending}
              emptyMessage="No categories found."
              label="Category"
              options={categoryOptions.items}
              placeholder={categoryOptions.isPending ? 'Loading categories...' : 'Select or create category'}
            />
          )}
        </form.AppField>
        <EditFormFullWidth>
          <form.AppField name="description">
            {(field) => <field.TextareaField label="Description" rows={4} />}
          </form.AppField>
        </EditFormFullWidth>
      </EditFormGrid>
      <EditFormActions className="mt-4">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending || isSupplierSelectPending} type="submit">
              {isSubmitting || isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </EditFormActions>
    </form>
  );
};
