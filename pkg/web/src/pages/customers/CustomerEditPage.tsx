import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type React from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { CustomerForm } from './components/CustomerForm.js';

type CustomerEditPageProps = {
  customerId: UUID;
};

export const CustomerEditPage: React.FC<CustomerEditPageProps> = ({ customerId }) => {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const customerQuery = useQuery(trpc.customers.get.queryOptions({ id: customerId }));
  const updateCustomerMutation = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.customers.list.queryFilter()),
          queryClient.invalidateQueries(trpc.customers.get.queryFilter({ id: customerId })),
        ]);
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
        <CustomerForm
          customer={customerQuery.data}
          key={customerQuery.data.id}
          onSave={(value) => updateCustomerMutation.mutateAsync(value)}
        />
      ) : null}
    </EditPageLayout>
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
