import {
  Price,
  type Product,
  ProductModelCode,
  ProductName,
  ProductOptionCode,
  ProductOptionName,
  UUID,
} from '@pkg/schema';
import { Loader2Icon, PlusIcon, Trash2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';
import { useAppForm } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { FieldGroup } from '@/components/ui/field.js';

type ProductFormValues = z.infer<typeof ProductFormValues>;
const ProductFormValues = z.object({
  basePrice: Price,
  description: z.string(),
  modelCode: ProductModelCode,
  name: ProductName,
  options: z.array(
    z.object({
      id: UUID.optional(),
      name: ProductOptionName,
      code: ProductOptionCode,
      price: Price,
    }),
  ),
});

type ProductFormProps = {
  initialProduct?: Product;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductFormValues) => Promise<unknown>;
};

export const ProductForm: React.FC<ProductFormProps> = ({ initialProduct, isPending, submitLabel, onSubmit }) => {
  const defaultValues: ProductFormValues = {
    basePrice: initialProduct?.basePrice ?? NaN,
    description: initialProduct?.description ?? '',
    modelCode: initialProduct?.modelCode ?? '',
    name: initialProduct?.name ?? '',
    options:
      initialProduct?.options.map((option) => ({
        id: option.id,
        code: option.code,
        name: option.name,
        price: option.price,
      })) ?? [],
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
        <form.Field name="options" mode="array">
          {(field) => (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium">Options</h2>
                <Button
                  onClick={() => field.pushValue({ name: '', code: '', price: NaN })}
                  type="button"
                  variant="outline"
                >
                  <PlusIcon data-icon="inline-start" />
                  Add option
                </Button>
              </div>
              {field.state.value.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {field.state.value.map((option, index) => (
                    <ProductOptionRow
                      index={index}
                      key={option.id ?? index}
                      onRemove={() => field.removeValue(index)}
                      renderCodeField={() => (
                        <form.AppField name={`options[${index}].code`}>
                          {(optionField) => <optionField.TextField autoComplete="off" label="Code" />}
                        </form.AppField>
                      )}
                      renderNameField={() => (
                        <form.AppField name={`options[${index}].name`}>
                          {(optionField) => <optionField.TextField autoComplete="off" label="Name" />}
                        </form.AppField>
                      )}
                      renderPriceField={() => (
                        <form.AppField name={`options[${index}].price`}>
                          {(optionField) => (
                            <optionField.CurrencyField
                              autoComplete="off"
                              currencyCode="ZAR"
                              label="Price"
                              placeholder="1234.56"
                            />
                          )}
                        </form.AppField>
                      )}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </form.Field>
      </FieldGroup>
      <div className="mt-4 flex justify-end gap-2">
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending} type="submit">
              {isSubmitting || isPending ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
};

type ProductOptionRowProps = {
  index: number;
  onRemove: () => void;
  renderCodeField: () => React.ReactNode;
  renderNameField: () => React.ReactNode;
  renderPriceField: () => React.ReactNode;
};

const ProductOptionRow: React.FC<ProductOptionRowProps> = ({
  index,
  onRemove,
  renderCodeField,
  renderNameField,
  renderPriceField,
}) => {
  return (
    <div className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_minmax(10rem,0.6fr)_minmax(10rem,0.6fr)_auto] md:items-start">
      {renderNameField()}
      {renderCodeField()}
      {renderPriceField()}
      <Button
        aria-label={`Remove option ${index + 1}`}
        className="self-end"
        onClick={onRemove}
        size="icon"
        type="button"
        variant="outline"
      >
        <Trash2Icon />
      </Button>
    </div>
  );
};
