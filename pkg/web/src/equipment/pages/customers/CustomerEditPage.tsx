import type { Customer, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useMemo } from 'react';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { RemoveEntityButton } from '@/components/common/RemoveEntityButton.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { AuditTable, useCustomerAuditTableStore } from '@/equipment/components/audit/AuditTable.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobListTable } from '../jobs/JobListPage.js';
import { QuoteTable } from '../quotes/QuotesPage.js';
import { CustomerForm } from './components/CustomerForm.js';

type CustomerEditPageProps = {
  customerId: UUID;
};

export const CustomerEditPage: React.FC<CustomerEditPageProps> = ({ customerId }) => {
  const trpc = useTRPC();
  const { invalidateCustomers } = useQueryInvalidation();
  const customerQuery = useQuery(trpc.customers.get.queryOptions({ id: customerId }));
  const updateCustomerMutation = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: async () => {
        await invalidateCustomers();
      },
    }),
  );

  return (
    <PageLayout description="Edit Customer" size="md" title={customerQuery.data?.companyName ?? 'Loading customer...'}>
      {customerQuery.isPending ? <CustomerFormSkeleton /> : null}
      <ErrorMessage error={customerQuery.error} fallbackMessage="Unable to load customer." />
      {customerQuery.data ? (
        <CustomerEditTabs
          customer={customerQuery.data}
          onCustomerSave={(value) => updateCustomerMutation.mutateAsync(value)}
        />
      ) : null}
    </PageLayout>
  );
};

type CustomerEditTabsProps = {
  customer: Customer;
  onCustomerSave: React.ComponentProps<typeof CustomerForm>['onSave'];
};

const CustomerEditTabs: React.FC<CustomerEditTabsProps> = ({ customer, onCustomerSave }) => {
  const canRemoveCustomer = useCan('customer:remove').can;
  const canReadJobs = useCan('job:read').can;
  const canReadQuotes = useCan('quote:read').can;
  const auditAccess = useCan('audit:read');
  const customerAuditFilters = useMemo(
    () => ({
      entityIds: [customer.id],
      entityTypes: ['customer' as const],
    }),
    [customer.id],
  );

  return (
    <Tabs className="w-full" defaultValue="details" size="sm">
      <TabsList variant="default">
        <TabsTrigger value="details">Details</TabsTrigger>
        {canReadQuotes ? <TabsTrigger value="quotes">Quotes</TabsTrigger> : null}
        {canReadJobs ? <TabsTrigger value="jobs">Jobs</TabsTrigger> : null}
        {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
      </TabsList>
      <TabsContent className="pt-4" value="details">
        <CustomerForm customer={customer} key={customer.id} onSave={onCustomerSave} />
        {canRemoveCustomer ? (
          <div className="mt-8 flex justify-end border-t pt-4">
            <RemoveCustomerButton customer={customer} />
          </div>
        ) : null}
      </TabsContent>
      {canReadQuotes ? (
        <TabsContent className="pt-4" value="quotes">
          <QuoteTable customerId={customer.id} />
        </TabsContent>
      ) : null}
      {canReadJobs ? (
        <TabsContent className="pt-4" value="jobs">
          <JobListTable customerId={customer.id} />
        </TabsContent>
      ) : null}
      {auditAccess.can ? (
        <TabsContent className="pt-4" value="audit">
          <AuditTable
            emptyMessage="No audit events found for this customer."
            fixedFilters={customerAuditFilters}
            showEntityTypeFilter={false}
            store={useCustomerAuditTableStore}
          />
        </TabsContent>
      ) : null}
    </Tabs>
  );
};

const RemoveCustomerButton: React.FC<{ customer: Customer }> = ({ customer }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateCustomers } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const removeCustomerMutation = useMutation(
    trpc.customers.remove.mutationOptions({
      onSuccess: async () => {
        await invalidateCustomers();
        await navigate({ to: '/equipment/customers' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to remove customer.');
      },
    }),
  );

  return (
    <RemoveEntityButton
      description={
        <>
          Permanently remove {customer.companyName} from your customers. Customers linked to Quotes or other records
          cannot be removed.
        </>
      }
      isPending={removeCustomerMutation.isPending}
      onConfirm={() => removeCustomerMutation.mutate({ id: customer.id })}
      title="Remove customer"
      triggerLabel="Remove customer"
    />
  );
};

function CustomerFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
