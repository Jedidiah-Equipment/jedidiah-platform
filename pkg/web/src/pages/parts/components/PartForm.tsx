import {
  type Part,
  PartCategory,
  PartCode,
  PartDescription,
  PartFinish,
  PartName,
  PartSupplierCode,
  type Supplier,
  UUID,
} from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useTRPC } from '@/lib/trpc.js';

type PartFormValues = z.infer<typeof PartFormValues>;
const PartFormValues = z.object({
  category: PartCategory,
  code: PartCode,
  description: PartDescription,
  drawingCode: z.string().trim(),
  finish: PartFinish,
  name: PartName,
  supplierCode: PartSupplierCode,
  supplierId: UUID,
});

type PartFormProps = {
  fixedSupplier?: Pick<Supplier, 'companyName' | 'id'>;
  initialPart?: Part;
  isPending: boolean;
  onSubmit: (value: PartFormValues) => Promise<unknown>;
  submitLabel: string;
};

export const PartForm: React.FC<PartFormProps> = ({ fixedSupplier, initialPart, isPending, onSubmit, submitLabel }) => {
  const trpc = useTRPC();
  const suppliersQuery = useQuery(
    trpc.suppliers.list.queryOptions(
      {
        pageSize: 0,
        sortBy: 'companyName',
        sortDirection: 'asc',
      },
      {
        enabled: !fixedSupplier,
      },
    ),
  );
  const supplierOptions =
    suppliersQuery.data?.items.map((supplier) => ({
      label: supplier.companyName,
      value: supplier.id,
    })) ?? [];
  const isSupplierSelectPending = !fixedSupplier && suppliersQuery.isPending;
  const categoriesQuery = useQuery(trpc.parts.categories.queryOptions());

  const form = useAppForm({
    defaultValues: {
      category: initialPart?.category ?? '',
      code: initialPart?.code ?? '',
      description: initialPart?.description ?? '',
      drawingCode: initialPart?.drawingCode ?? '',
      finish: initialPart?.finish ?? '',
      name: initialPart?.name ?? '',
      supplierCode: initialPart?.supplierCode ?? '',
      supplierId: fixedSupplier?.id ?? initialPart?.supplierId ?? '',
    },
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
                options={supplierOptions}
                placeholder={isSupplierSelectPending ? 'Loading suppliers...' : 'Select supplier'}
              />
            )}
          </form.AppField>
        )}
        <form.AppField name="supplierCode">
          {(field) => <field.TextField autoComplete="off" label="Supplier code" />}
        </form.AppField>
        <form.AppField name="category">
          {(field) => (
            <field.CreatableComboboxField
              disabled={categoriesQuery.isPending}
              emptyMessage="No categories found."
              label="Category"
              options={categoriesQuery.data?.categories ?? []}
              placeholder={categoriesQuery.isPending ? 'Loading categories...' : 'Select or create category'}
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
