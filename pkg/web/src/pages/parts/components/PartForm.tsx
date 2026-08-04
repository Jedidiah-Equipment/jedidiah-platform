import type { Part, Supplier } from '@pkg/schema';
import { IconLoader2 } from '@tabler/icons-react';
import type React from 'react';

import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Button } from '@/components/ui/button.js';
import { usePartCategoryOptions, usePartStorageLocationOptions, useSupplierOptions } from '@/hooks/options/index.js';
import { PartFormValues, partStockTrackingModeOptions, partUnitOfMeasureOptions, toPartFormValues } from './types.js';

type PartFormProps = {
  fixedSupplier?: Pick<Supplier, 'companyName' | 'id'> | undefined;
  footerActions?: React.ReactNode;
  initialPart?: Part;
  isPending: boolean;
  onSubmit: (value: PartFormValues) => Promise<unknown>;
  submitLabel: string;
};

export const PartForm: React.FC<PartFormProps> = ({
  fixedSupplier,
  footerActions,
  initialPart,
  isPending,
  onSubmit,
  submitLabel,
}) => {
  const supplierOptions = useSupplierOptions({ enabled: !fixedSupplier, limit: 0 });
  const isSupplierSelectPending = !fixedSupplier && supplierOptions.isPending;
  const categoryOptions = usePartCategoryOptions();
  const storageLocationOptions = usePartStorageLocationOptions();

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
          <form.Subscribe selector={(state) => state.values.isInternallyFabricated}>
            {(isInternallyFabricated) =>
              isInternallyFabricated ? null : (
                <form.AppField name="supplierId">
                  {(field) => (
                    <field.ComboboxField
                      disabled={isSupplierSelectPending}
                      emptyMessage="No suppliers found."
                      label="Supplier"
                      options={supplierOptions.selectOptions}
                      placeholder={isSupplierSelectPending ? 'Loading suppliers...' : 'Search suppliers'}
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
        )}
        <form.AppField name="supplierCode">
          {(field) => <field.TextField autoComplete="off" label="Supplier code" />}
        </form.AppField>
        <form.AppField name="unitOfMeasure">
          {(field) => (
            <field.SelectField
              label="Unit"
              onValueCommit={(unitOfMeasure) => {
                if (unitOfMeasure !== 'mm') form.setFieldValue('standardPurchaseLengthMm', NaN);
              }}
              options={partUnitOfMeasureOptions}
              placeholder="Select unit"
            />
          )}
        </form.AppField>
        <form.AppField name="stockTrackingMode">
          {(field) => (
            <field.SelectField
              label="Stock tracking"
              options={partStockTrackingModeOptions}
              placeholder="Select tracking mode"
            />
          )}
        </form.AppField>
        <form.AppField name="storageLocation">
          {(field) => (
            <field.CreatableComboboxField
              disabled={storageLocationOptions.isPending}
              emptyMessage="No storage locations found."
              label="Storage location"
              options={storageLocationOptions.items}
              placeholder={
                storageLocationOptions.isPending ? 'Loading storage locations...' : 'Select or create location'
              }
            />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.unitOfMeasure}>
          {(unitOfMeasure) =>
            unitOfMeasure === 'mm' ? (
              <form.AppField name="standardPurchaseLengthMm">
                {(field) => (
                  <field.NumberField
                    inputMode="numeric"
                    label="Standard purchase length (mm)"
                    min={1}
                    placeholder="6000"
                    step={1}
                  />
                )}
              </form.AppField>
            ) : null
          }
        </form.Subscribe>
        <form.AppField name="minimumStock">
          {(field) => (
            <field.NumberField inputMode="numeric" label="Minimum stock" min={0} placeholder="Not set" step={1} />
          )}
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
        {footerActions}
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending || isSupplierSelectPending} type="submit">
              {isSubmitting || isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </EditFormActions>
    </form>
  );
};
