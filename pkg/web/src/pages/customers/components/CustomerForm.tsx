import type { Customer, CustomerCreateInput } from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';

import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';
import { CustomerFormValues, toCustomerCreateInput, toCustomerFormValues } from './types.js';

type CustomerFormProps = {
  initialCustomer?: Customer;
  isPending: boolean;
  onSubmit: (value: CustomerCreateInput) => Promise<unknown>;
  submitLabel: string;
};

export const CustomerForm: React.FC<CustomerFormProps> = ({ initialCustomer, isPending, onSubmit, submitLabel }) => {
  const form = useAppForm({
    defaultValues: toCustomerFormValues(initialCustomer),
    validators: {
      onSubmit: CustomerFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(toCustomerCreateInput(value));
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
        <form.AppField name="companyName">
          {(field) => <field.TextField autoComplete="organization" label="Company name" />}
        </form.AppField>
        <form.AppField name="email">
          {(field) => <field.TextField autoComplete="email" label="Email" type="email" />}
        </form.AppField>
        <form.AppField name="contactPerson">
          {(field) => <field.TextField autoComplete="name" label="Contact person" />}
        </form.AppField>
        <form.AppField name="phone">{(field) => <field.TextField autoComplete="tel" label="Phone" />}</form.AppField>
        <EditFormFullWidth>
          <form.AppField name="address">
            {(field) => <field.TextareaField autoComplete="street-address" label="Address" rows={4} />}
          </form.AppField>
        </EditFormFullWidth>
        <EditFormFullWidth>
          <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
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
