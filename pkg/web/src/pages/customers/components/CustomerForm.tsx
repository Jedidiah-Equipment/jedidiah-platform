import { type Customer, CustomerCompanyName, CustomerEmail } from '@pkg/schema';
import { Loader2Icon } from 'lucide-react';
import type React from 'react';
import { z } from 'zod';

import { useAppForm } from '@/components/form/index.js';
import { EditFormActions, EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditPageLayout.js';
import { Button } from '@/components/ui/button.js';

type CustomerFormValues = z.infer<typeof CustomerFormValues>;
const CustomerFormValues = z.object({
  address: z.string(),
  companyName: CustomerCompanyName,
  contactPerson: z.string(),
  email: z
    .string()
    .trim()
    .refine((value) => value === '' || CustomerEmail.safeParse(value).success, 'Enter a valid email address'),
  notes: z.string(),
  phone: z.string(),
});

type CustomerFormSubmitValues = Omit<CustomerFormValues, 'email'> & {
  email: string | null;
};

type CustomerFormProps = {
  initialCustomer?: Customer;
  isPending: boolean;
  onSubmit: (value: CustomerFormSubmitValues) => Promise<unknown>;
  submitLabel: string;
};

export const CustomerForm: React.FC<CustomerFormProps> = ({ initialCustomer, isPending, onSubmit, submitLabel }) => {
  const defaultValues: CustomerFormValues = {
    address: initialCustomer?.address ?? '',
    companyName: initialCustomer?.companyName ?? '',
    contactPerson: initialCustomer?.contactPerson ?? '',
    email: initialCustomer?.email ?? '',
    notes: initialCustomer?.notes ?? '',
    phone: initialCustomer?.phone ?? '',
  };
  const form = useAppForm({
    defaultValues,
    validators: {
      onSubmit: CustomerFormValues,
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        ...value,
        email: value.email.trim() === '' ? null : value.email.trim().toLowerCase(),
      });
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
