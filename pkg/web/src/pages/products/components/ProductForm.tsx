import {
  type AssemblyInput,
  Price,
  type Product,
  ProductAssembliesInput,
  ProductLeadTimeDays,
  ProductModelCode,
  ProductName,
} from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';
import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { ProductAssembliesEditor } from './ProductAssembliesEditor.js';

type ProductFormValues = z.infer<typeof ProductFormValues>;
const ProductFormFields = z.object({
  basePrice: Price,
  description: z.string(),
  leadTimeDays: ProductLeadTimeDays,
  modelCode: ProductModelCode,
  name: ProductName,
});
const ProductFormValues = ProductFormFields.extend({
  assemblies: ProductAssembliesInput,
});
type ProductAssemblyInputValue = z.infer<typeof AssemblyInput>;

type ProductFormProps = {
  initialProduct?: Product;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductFormValues) => Promise<unknown>;
};

export const ProductForm: React.FC<ProductFormProps> = ({ initialProduct, isPending, submitLabel, onSubmit }) => {
  const defaultValues: ProductFormValues = {
    assemblies: getInitialAssemblies(initialProduct),
    basePrice: initialProduct?.basePrice ?? NaN,
    description: initialProduct?.description ?? '',
    leadTimeDays: initialProduct?.leadTimeDays ?? NaN,
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
  };

  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: validateProductForm,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(ProductFormValues.parse(value));
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
        <form.AppField name="modelCode">
          {(field) => <field.TextField autoComplete="off" label="Model code" />}
        </form.AppField>
        <form.AppField name="basePrice">
          {(field) => (
            <field.CurrencyField autoComplete="off" currencyCode="ZAR" label="Base price" placeholder="1234.56" />
          )}
        </form.AppField>
        <form.AppField name="leadTimeDays">
          {(field) => (
            <field.NumberField autoComplete="off" inputMode="numeric" label="Lead time (days)" placeholder="14" />
          )}
        </form.AppField>
        <EditFormFullWidth>
          <form.AppField name="description">
            {(field) => <field.TextareaField label="Description" rows={4} />}
          </form.AppField>
        </EditFormFullWidth>
        <EditFormFullWidth>
          <form.Field name="assemblies" mode="array">
            {(assembliesField) => <ProductAssembliesEditor assembliesField={assembliesField} FormField={form.Field} />}
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
  );
};

function getInitialAssemblies(initialProduct: Product | undefined): ProductAssemblyInputValue[] {
  return (initialProduct?.assemblies ?? []).map((assembly) =>
    assembly.kind === 'standard'
      ? {
          id: assembly.id,
          kind: assembly.kind,
          name: assembly.name,
          parts: assembly.parts,
        }
      : {
          id: assembly.id,
          kind: assembly.kind,
          name: assembly.name,
          overrideStandardAssemblyIds: assembly.overrideStandardAssemblyIds,
          parts: assembly.parts,
          price: assembly.price,
        },
  );
}

function validateProductForm({ value }: { value: ProductFormValues }) {
  const result = ProductFormValues.safeParse(value);

  if (result.success) {
    return undefined;
  }

  return {
    fields: Object.fromEntries(result.error.issues.map((issue) => [toFormFieldName(issue.path), issue.message])),
  };
}

function toFormFieldName(path: PropertyKey[]): string {
  return path.reduce<string>((fieldName, pathSegment) => {
    if (typeof pathSegment === 'number') {
      return `${fieldName}[${pathSegment}]`;
    }

    return fieldName ? `${fieldName}.${String(pathSegment)}` : String(pathSegment);
  }, '');
}
