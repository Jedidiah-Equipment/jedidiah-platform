import { opensWebJobs } from '@pkg/domain/contracting';
import { type Customer, CustomerPatchInput } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { DetailAsideGrid } from '@/components/page-layout/DetailAsideGrid.js';
import { EditFormFullWidth } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { JobsTable } from '@/contracting/pages/jobs/JobsPage.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { CustomerEditTab } from './customer-edit-tabs.js';
import { Farms } from './Farms.js';
import { CustomerFormValues } from './types.js';

export function CustomerEditPage({
  id,
  tab,
  onTabChange,
}: {
  id: string;
  tab: CustomerEditTab;
  onTabChange: (tab: CustomerEditTab) => void;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingDirectory.customers.get.queryOptions({ id }));
  const readsJobs = opensWebJobs(useAccess().data);
  const activeTab = tab === 'jobs' && !readsJobs ? 'details' : tab;
  return (
    <PageLayout title={query.data?.name ?? 'Customer'} description="Customer details, Farms and Jobs">
      <QueryContent query={query} errorMessage="Unable to load customer.">
        {(customer) => (
          <Tabs
            className="w-full"
            onValueChange={(value) => onTabChange(CustomerEditTab.parse(value))}
            size="sm"
            value={activeTab}
          >
            <TabsList variant="default">
              <TabsTrigger value="details">Details</TabsTrigger>
              {readsJobs ? <TabsTrigger value="jobs">Jobs</TabsTrigger> : null}
            </TabsList>
            <TabsContent className="pt-4" value="details">
              <DetailAsideGrid>
                <CustomerForm key={id} customer={customer} />
                <Farms customerId={customer.id} />
              </DetailAsideGrid>
            </TabsContent>
            {readsJobs ? (
              <TabsContent className="pt-4" value="jobs">
                <JobsTable scope={{ kind: 'customer', id: customer.id }} />
              </TabsContent>
            ) : null}
          </Tabs>
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
