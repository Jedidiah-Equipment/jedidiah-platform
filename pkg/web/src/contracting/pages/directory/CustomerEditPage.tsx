import {
  type Customer,
  CustomerEmail,
  CustomerName,
  CustomerOptionalText,
  CustomerPatchInput,
} from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { emptyStringOr } from '@/components/form/utils/form-schema.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { Farms } from './Farms.js';
import { useDirectoryInvalidation } from './use-directory-invalidation.js';

const CustomerFormValues = z.object({
  name: CustomerName,
  contactName: CustomerOptionalText,
  phone: CustomerOptionalText,
  email: emptyStringOr(CustomerEmail),
  notes: CustomerOptionalText,
});
export function CustomerEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingDirectory.customers.get.queryOptions({ id }));
  return (
    <PageLayout title={query.data?.name ?? 'Customer'} description="Customer details and Farms" size="md">
      <ErrorMessage error={query.error} fallbackMessage="Unable to load customer." />
      {query.data ? (
        <>
          <CustomerForm key={id} customer={query.data} />
          <Farms customerId={query.data.id} />
        </>
      ) : query.isPending ? (
        <p>Loading customer…</p>
      ) : null}
    </PageLayout>
  );
}
function CustomerForm({ customer }: { customer: Customer }) {
  const trpc = useTRPC();
  const invalidate = useDirectoryInvalidation();
  const canEdit = useCan('contracting_directory:update').can;
  const patch = useMutation(trpc.contractingDirectory.customers.patch.mutationOptions({ onSuccess: invalidate }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: {
      name: customer.name,
      contactName: customer.contactName ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      notes: customer.notes ?? '',
    },
    failureMessage: 'Unable to update customer.',
    validator: CustomerFormValues,
    toInput: (values) => CustomerPatchInput.parse({ id: customer.id, ...values }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <form {...formProps} className="flex flex-col gap-4">
      <AutosaveStatus state={autosave.state} onRetry={() => void autosave.retry()} />
      <Card>
        <CardContent>
          <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
            <form.AppField name="name">
              {(field) => <field.TextField label="Name" autoComplete="organization" />}
            </form.AppField>
            <form.AppField name="contactName">
              {(field) => <field.TextField label="Contact name" autoComplete="name" />}
            </form.AppField>
            <form.AppField name="phone">
              {(field) => <field.TextField label="Phone" autoComplete="tel" />}
            </form.AppField>
            <form.AppField name="email">
              {(field) => <field.TextField label="Email" type="email" autoComplete="email" />}
            </form.AppField>
            <div className="sm:col-span-2">
              <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
            </div>
          </fieldset>
        </CardContent>
      </Card>
    </form>
  );
}
