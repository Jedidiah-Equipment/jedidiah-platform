import type { Product } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useProductRangeOptions } from '@/hooks/options/use-product-range-options.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductCreateFormValues, toProductMinimalCreateInput } from './components/types.js';

type ProductCreateDialogProps = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

const PRODUCT_CREATE_DEFAULT_VALUES: ProductCreateFormValues = {
  basePrice: NaN,
  buildTimeDays: NaN,
  modelCode: '',
  name: '',
  rangeId: '',
};

export const ProductCreateDialog: React.FC<ProductCreateDialogProps> = ({ onOpenChange, open }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateProducts } = useQueryInvalidation();
  const productRangeOptions = useProductRangeOptions();

  const showMutationError = useApiMutationErrorToast();

  const createProductMutation = useMutation(
    trpc.products.create.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to create product.');
      },
    }),
  );

  return (
    <CreateEntityDialog
      defaultValues={PRODUCT_CREATE_DEFAULT_VALUES}
      key={open ? 'open' : 'closed'}
      onCreate={(values) => createProductMutation.mutateAsync(toProductMinimalCreateInput(values))}
      onCreated={async (product: Product) => {
        await invalidateProducts();
        onOpenChange(false);
        toast.success('Product created');
        await navigate({ to: '/products/$id/edit', params: { id: product.id } });
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Save"
      title="New product"
      validator={ProductCreateFormValues}
    >
      {(form) => (
        <>
          <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
          <form.AppField name="modelCode">
            {(field) => <field.TextField autoComplete="off" label="Model code" />}
          </form.AppField>
          <form.AppField name="rangeId">
            {(field) => (
              <field.SelectField
                disabled={productRangeOptions.isPending}
                label="Range"
                options={productRangeOptions.selectOptions}
                placeholder={productRangeOptions.isPending ? 'Loading ranges...' : 'Select range'}
              />
            )}
          </form.AppField>
          <form.AppField name="basePrice">
            {(field) => (
              <field.CurrencyField autoComplete="off" currencyCode="ZAR" label="Base price" placeholder="R120,000" />
            )}
          </form.AppField>
          <form.AppField name="buildTimeDays">
            {(field) => (
              <field.NumberField autoComplete="off" inputMode="numeric" label="Build time (days)" placeholder="14" />
            )}
          </form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
};
