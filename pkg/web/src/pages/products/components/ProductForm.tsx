import {
  type AssemblyInput,
  AssemblyName,
  AssemblyPart,
  Price,
  type Product,
  ProductBuildTimeDays,
  ProductModelCode,
  ProductName,
  refineProductAssemblies,
  UUID,
} from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';
import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { ProductAssembliesEditor } from './ProductAssembliesEditor.js';

export type ProductFormValues = z.infer<typeof ProductFormValues>;

const ProductFormFields = z.object({
  basePrice: Price,
  currencyCode: z.literal('ZAR'),
  description: z.string(),
  buildTimeDays: ProductBuildTimeDays,
  modelCode: ProductModelCode,
  name: ProductName,
});

const StandardAssemblyFormInput = z.object({
  id: UUID.optional(),
  kind: z.literal('standard'),
  name: AssemblyName,
  parts: z.array(AssemblyPart),
});

const OptionalAssemblyFormInput = z.object({
  id: UUID.optional(),
  kind: z.literal('optional'),
  name: AssemblyName,
  overrideStandardAssemblyIds: z.array(UUID),
  parts: z.array(AssemblyPart),
  price: Price,
});

const ProductFormValues = ProductFormFields.extend({
  assemblies: z
    .array(z.discriminatedUnion('kind', [StandardAssemblyFormInput, OptionalAssemblyFormInput]))
    .superRefine(refineProductAssemblies),
});

export const emptyProductFormValues: ProductFormValues = {
  assemblies: [],
  basePrice: NaN,
  currencyCode: 'ZAR',
  description: '',
  buildTimeDays: NaN,
  modelCode: '',
  name: '',
};

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
    currencyCode: initialProduct?.currencyCode ?? 'ZAR',
    description: initialProduct?.description ?? '',
    buildTimeDays: initialProduct?.buildTimeDays ?? NaN,
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
  };

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
