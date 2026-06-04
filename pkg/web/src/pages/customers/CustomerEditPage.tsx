import type { Customer, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useMemo } from 'react';
import { AuditTable, useCustomerAuditTableStore } from '@/components/audit/AuditTable.js';
import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
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
    <EditPageLayout
      back={<BackButton to="/customers">Customers</BackButton>}
      description="Edit Customer"
      title={customerQuery.data?.companyName ?? 'Loading customer...'}
    >
      {customerQuery.isPending ? <CustomerFormSkeleton /> : null}
      <ErrorMessage error={customerQuery.error} fallbackMessage="Unable to load customer." />
      {customerQuery.data ? (
        <CustomerEditTabs
          customer={customerQuery.data}
          onCustomerSave={(value) => updateCustomerMutation.mutateAsync(value)}
        />
      ) : null}
    </EditPageLayout>
  );
};

type CustomerEditTabsProps = {
  customer: Customer;
  onCustomerSave: React.ComponentProps<typeof CustomerForm>['onSave'];
};

const CustomerEditTabs: React.FC<CustomerEditTabsProps> = ({ customer, onCustomerSave }) => {
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
        {auditAccess.can ? <TabsTrigger value="audit">Audit</TabsTrigger> : null}
      </TabsList>
      <TabsContent className="pt-4" value="details">
        <CustomerForm customer={customer} key={customer.id} onSave={onCustomerSave} />
      </TabsContent>
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
