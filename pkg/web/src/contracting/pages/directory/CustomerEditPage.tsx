import { type Customer, CustomerPatchInput } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { Farms } from './Farms.js';
import { CustomerFormValues } from './types.js';

export function CustomerEditPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingDirectory.customers.get.queryOptions({ id }));
  return (
    <PageLayout title={query.data?.name ?? 'Customer'} description="Customer details and Farms" size="md">
      <QueryContent query={query} errorMessage="Unable to load customer.">
        {(customer) => (
          <>
            <CustomerForm key={id} customer={customer} />
            <Farms customerId={customer.id} />
          </>
        )}
      </QueryContent>
    </PageLayout>
  );
}
function CustomerForm({ customer }: { customer: Customer }) {
  const trpc = useTRPC();
  const { invalidateDirectory } = useQueryInvalidation();
  const canEdit = useCan('contracting_directory:update').can;
  const patch = useMutation(
    trpc.contractingDirectory.customers.patch.mutationOptions({ onSuccess: invalidateDirectory }),
  );
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
    <AutosaveFormCard formProps={formProps} autosave={autosave} disabled={!canEdit}>
      <form.AppField name="name">
        {(field) => <field.TextField label="Name" autoComplete="organization" />}
      </form.AppField>
      <form.AppField name="contactName">
        {(field) => <field.TextField label="Contact name" autoComplete="name" />}
      </form.AppField>
      <form.AppField name="phone">{(field) => <field.TextField label="Phone" autoComplete="tel" />}</form.AppField>
      <form.AppField name="email">
        {(field) => <field.TextField label="Email" type="email" autoComplete="email" />}
      </form.AppField>
      <EditFormFullWidth>
        <form.AppField name="notes">{(field) => <field.TextareaField label="Notes" rows={4} />}</form.AppField>
      </EditFormFullWidth>
    </AutosaveFormCard>
  );
}
