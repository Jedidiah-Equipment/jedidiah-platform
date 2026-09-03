import type { Part } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { usePartCategoryOptions, useSupplierOptions } from '@/equipment/hooks/options/index.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import {
  type PartFormValues,
  PartFormValues as PartFormValuesSchema,
  partUnitOfMeasureOptions,
  toPartFormValues,
  toPartInput,
} from './components/types.js';

export function PartListCreateDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated: (part: Part) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const suppliers = useSupplierOptions({ enabled: open, limit: 0 });
  const categories = usePartCategoryOptions({ enabled: open });
  const { invalidateParts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const mutation = useMutation(
    trpc.parts.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create part.'),
    }),
  );

  return (
    <CreateEntityDialog<PartFormValues, Part>
      canSubmit={!suppliers.isPending}
      defaultValues={toPartFormValues({})}
      description="Create the Part, then continue with its full inventory details."
      key={open ? 'open' : 'closed'}
      onCreate={(values) => mutation.mutateAsync(toPartInput(values))}
      onCreated={async (part) => {
        await invalidateParts();
        onOpenChange(false);
        toast.success('Part created');
        onCreated(part);
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Create part"
      title="New part"
      validator={PartFormValuesSchema}
    >
      {(form) => (
        <>
          <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
          <form.AppField name="code">{(field) => <field.TextField autoComplete="off" label="Code" />}</form.AppField>
          <form.AppField name="category">
            {(field) => (
              <field.CreatableComboboxField
                disabled={categories.isPending}
                emptyMessage="No categories found."
                label="Category"
                options={categories.items}
                placeholder={categories.isPending ? 'Loading categories...' : 'Select or create category'}
              />
            )}
          </form.AppField>
          <form.AppField name="finish">
            {(field) => <field.TextField autoComplete="off" label="Finish" />}
          </form.AppField>
          <form.AppField name="isInternallyFabricated">
            {(field) => <field.CheckboxField label="Internally fabricated" />}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.isInternallyFabricated}>
            {(isInternallyFabricated) =>
              isInternallyFabricated ? null : (
                <form.AppField name="supplierId">
                  {(field) => (
                    <field.ComboboxField
                      disabled={suppliers.isPending}
                      emptyMessage="No suppliers found."
                      label="Supplier"
                      options={suppliers.selectOptions}
                      placeholder={suppliers.isPending ? 'Loading suppliers...' : 'Search suppliers'}
                    />
                  )}
                </form.AppField>
              )
            }
          </form.Subscribe>
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
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.unitOfMeasure}>
            {(unitOfMeasure) =>
              unitOfMeasure === 'mm' ? (
                <form.AppField name="standardPurchaseLengthMm">
                  {(field) => <field.NumberField inputMode="numeric" label="Standard purchase length (mm)" min={1} />}
                </form.AppField>
              ) : null
            }
          </form.Subscribe>
          <form.AppField name="description">
            {(field) => <field.TextareaField label="Description" rows={3} />}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
