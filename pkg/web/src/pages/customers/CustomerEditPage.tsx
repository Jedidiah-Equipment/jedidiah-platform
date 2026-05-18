import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeftIcon } from 'lucide-react';
import type React from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/ErrorMessage.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { CustomerForm } from './components/CustomerForm.js';

type CustomerEditPageProps = {
  customerId: UUID;
};

export const CustomerEditPage: React.FC<CustomerEditPageProps> = ({ customerId }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const customerQuery = useQuery(trpc.customers.get.queryOptions({ id: customerId }));
  const updateCustomerMutation = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.customers.list.queryFilter()),
          queryClient.invalidateQueries(trpc.customers.get.queryFilter({ id: customerId })),
        ]);
        toast.success('Customer updated');
        await navigate({ to: '/customers' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to update customer.');
      },
    }),
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div>
        <Button onClick={() => navigate({ to: '/customers' })} type="button" variant="ghost">
          <ArrowLeftIcon data-icon="inline-start" />
          Customers
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Directory</CardDescription>
          <CardTitle>Edit customer</CardTitle>
        </CardHeader>
        <CardContent>
          {customerQuery.isPending ? <CustomerFormSkeleton /> : null}
          <ErrorMessage error={customerQuery.error} fallbackMessage="Unable to load customer." />
          {customerQuery.data ? (
            <CustomerForm
              initialCustomer={customerQuery.data}
              isPending={updateCustomerMutation.isPending}
              key={customerQuery.data.id}
              onSubmit={(value) =>
                updateCustomerMutation.mutateAsync({
                  ...value,
                  id: customerQuery.data.id,
                })
              }
              submitLabel="Save customer"
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
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
