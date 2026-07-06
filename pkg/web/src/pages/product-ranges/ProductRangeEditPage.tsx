import type { ProductRange, UUID } from '@pkg/schema';
import { IconLoader2, IconTrash } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { ProductRangeForm } from './components/ProductRangeForm.js';

type ProductRangeEditPageProps = {
  rangeId: UUID;
};

export const ProductRangeEditPage: React.FC<ProductRangeEditPageProps> = ({ rangeId }) => {
  const trpc = useTRPC();
  const canEdit = useCan('product_range:update').can;
  const { invalidateProductRanges } = useQueryInvalidation();
  const rangeQuery = useQuery(trpc.productRanges.get.queryOptions({ id: rangeId }));
  const updateMutation = useMutation(
    trpc.productRanges.update.mutationOptions({
      onSuccess: async () => {
        await invalidateProductRanges();
      },
    }),
  );

  return (
    <PageLayout description="Edit Product Range" size="md" title={rangeQuery.data?.name ?? 'Loading range...'}>
      {rangeQuery.isPending ? <Skeleton className="h-10 w-full" /> : null}
      <ErrorMessage error={rangeQuery.error} fallbackMessage="Unable to load Product Range." />
      {rangeQuery.data ? (
        <>
          <ProductRangeForm
            canEdit={canEdit}
            key={rangeQuery.data.id}
            onSave={(value) => updateMutation.mutateAsync(value)}
            range={rangeQuery.data}
          />
          {canEdit ? (
            <div className="mt-8 flex justify-end border-t pt-4">
              <RemoveProductRangeButton range={rangeQuery.data} />
            </div>
          ) : null}
        </>
      ) : null}
    </PageLayout>
  );
};

const RemoveProductRangeButton: React.FC<{ range: ProductRange }> = ({ range }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateProductRanges } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);

  const removeMutation = useMutation(
    trpc.productRanges.delete.mutationOptions({
      onSuccess: async () => {
        await invalidateProductRanges();
        toast.success('Product Range deleted');
        await navigate({ to: '/product-ranges' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to delete Product Range.');
      },
    }),
  );

  return (
    <Dialog onOpenChange={setIsOpen} open={isOpen}>
      <DialogTrigger render={<Button type="button" variant="destructive" />}>
        <IconTrash data-icon="inline-start" />
        Remove range
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Product Range</DialogTitle>
          <DialogDescription>
            Remove {range.name} from Product Ranges. This only works when no products are linked to it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={removeMutation.isPending} type="button" variant="outline" />}>
            Cancel
          </DialogClose>
          <Button
            disabled={removeMutation.isPending}
            onClick={() => removeMutation.mutate({ id: range.id })}
            type="button"
            variant="destructive"
          >
            {removeMutation.isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Remove
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
