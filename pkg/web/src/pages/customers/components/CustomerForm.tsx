import type { Customer, CustomerUpdateInput } from '@pkg/schema';
import type React from 'react';

import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { CustomerFormValues, toCustomerFormValues, toCustomerUpdateInput } from './types.js';

type CustomerFormProps = {
  customer: Customer;
  onSave: (value: CustomerUpdateInput) => Promise<unknown>;
};

export const CustomerForm: React.FC<CustomerFormProps> = ({ customer, onSave }) => {
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toCustomerFormValues(customer),
    failureMessage: 'Unable to update customer.',
    save: onSave,
    toInput: (value) => toCustomerUpdateInput(customer.id, value),
    validator: CustomerFormValues,
  });

  const saveCommittedField = () => {
    autosave.markChanged();
    queueMicrotask(() => {
      void autosave.flush();
    });
  };

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
      <Card>
        <CardContent>
          <EditFormGrid>
            <EditFormFullWidth>
              <form.AppField name="thumbnailDataUrl">
                {(field) => (
                  <field.ThumbnailField
                    fallbackLabel={form.state.values.companyName || 'Customer'}
                    label="Thumbnail"
                    onValueCommit={saveCommittedField}
                  />
                )}
              </form.AppField>
            </EditFormFullWidth>
            <form.AppField name="companyName">
              {(field) => <field.TextField autoComplete="organization" label="Company name" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField autoComplete="email" label="Email" type="email" />}
            </form.AppField>
            <form.AppField name="vatNumber">
              {(field) => <field.TextField autoComplete="off" label="VAT number" />}
            </form.AppField>
            <form.AppField name="contactPerson">
              {(field) => <field.TextField autoComplete="name" label="Contact person" />}
            </form.AppField>
            <form.AppField name="phone">
              {(field) => <field.TextField autoComplete="tel" label="Phone" />}
            </form.AppField>
            <EditFormFullWidth>
              <form.AppField name="address">
                {(field) => <field.TextareaField autoComplete="street-address" label="Address" rows={4} />}
              </form.AppField>
            </EditFormFullWidth>
            <EditFormFullWidth>
              <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
            </EditFormFullWidth>
          </EditFormGrid>
        </CardContent>
      </Card>
    </form>
  );
};
