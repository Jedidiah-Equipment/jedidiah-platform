import { Price, type Product, ProductModelCode, ProductName } from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { DialogFooter } from '@/components/ui/dialog.js';
import { FieldGroup } from '@/components/ui/field.js';

type ProductFormValues = z.infer<typeof ProductFormValues>;
const ProductFormValues = z.object({
  basePrice: Price,
  description: z.string(),
  modelCode: ProductModelCode,
  name: ProductName,
});

type ProductFormProps = {
  initialProduct?: Product;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductFormValues) => Promise<unknown>;
};

export const ProductForm: React.FC<ProductFormProps> = ({ initialProduct, isPending, submitLabel, onSubmit }) => {
  const form = useAppForm({
    defaultValues: {
      basePrice: initialProduct?.basePrice ?? NaN,
      description: initialProduct?.description ?? '',
      modelCode: initialProduct?.modelCode ?? '',
      name: initialProduct?.name ?? '',
    } satisfies ProductFormValues,
    validators: {
      onSubmit: ProductFormValues,
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
      <FieldGroup>
        <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
        <form.AppField name="modelCode">
          {(field) => <field.TextField autoComplete="off" label="Model code" />}
        </form.AppField>
        <form.AppField name="basePrice">
          {(field) => (
            <field.CurrencyField autoComplete="off" currencyCode="ZAR" label="Base price" placeholder="1234.56" />
          )}
        </form.AppField>
        <form.AppField name="description">
          {(field) => <field.TextareaField label="Description" rows={4} />}
        </form.AppField>
      </FieldGroup>
      <DialogFooter className="mt-4" showCloseButton>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending} type="submit">
              {isSubmitting || isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
};
