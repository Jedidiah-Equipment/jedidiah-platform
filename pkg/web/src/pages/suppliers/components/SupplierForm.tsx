import { type Supplier, SupplierName } from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';

type SupplierFormValues = z.infer<typeof SupplierFormValues>;
const SupplierFormValues = z.object({
  name: SupplierName,
});

type SupplierFormProps = {
  initialSupplier?: Supplier;
  isPending: boolean;
  onSubmit: (value: SupplierFormValues) => Promise<unknown>;
  submitLabel: string;
};

export const SupplierForm: React.FC<SupplierFormProps> = ({ initialSupplier, isPending, onSubmit, submitLabel }) => {
  const form = useAppForm({
    defaultValues: {
      name: initialSupplier?.name ?? '',
    },
    validators: {
      onSubmit: SupplierFormValues,
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
        <form.AppField name="name">
          {(field) => <field.TextField autoComplete="organization" label="Supplier name" />}
        </form.AppField>
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
