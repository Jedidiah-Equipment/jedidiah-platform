import { hasPermission } from '@pkg/domain';
import { IconLoader2, IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { FieldGroup } from '@/components/ui/field.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { productRangesPageDescription } from '@/utils/page-descriptions.js';
import { RangeThumbnail } from './components/RangeThumbnail.js';
import { ProductRangeFormValues, toProductRangeCreateInput } from './components/types.js';

export const ProductRangesPage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const canCreateRanges = hasPermission(access, 'product_range:create');
  const canUpdateRanges = hasPermission(access, 'product_range:update');

  const rangesQuery = useQuery(trpc.productRanges.list.queryOptions());
  const ranges = rangesQuery.data?.ranges ?? [];

  const [isCreateOpen, setCreateOpen] = useState(false);

  if (rangesQuery.isLoading) {
    return (
      <PageLayout description={productRangesPageDescription} size="lg" title="Product Ranges">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </PageLayout>
    );
  }

  if (rangesQuery.error) {
    return (
      <PageLayout description={productRangesPageDescription} size="lg" title="Product Ranges">
        <ErrorMessage error={rangesQuery.error} fallbackMessage="Unable to load Product Ranges." />
      </PageLayout>
    );
  }

  return (
    <>
      <PageLayout
        actions={
          canCreateRanges ? (
            <Button onClick={() => setCreateOpen(true)}>
              <IconPlus data-icon="inline-start" />
              New Range
            </Button>
          ) : null
        }
        description={productRangesPageDescription}
        size="lg"
        title="Product Ranges"
      >
        {ranges.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No Product Ranges yet.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ranges.map((range) => (
              <Card key={range.id} className="min-w-0">
                <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto] gap-0">
                  <div className="flex min-w-0 items-center gap-3">
                    <RangeThumbnail image={range.image} name={range.name} rangeId={range.id} />
                    <div className="min-w-0 space-y-0.5">
                      <CardTitle className="truncate">{range.name}</CardTitle>
                      <CardDescription>{range.image ? 'Image attached' : 'No image'}</CardDescription>
                    </div>
                  </div>
                  {canUpdateRanges ? (
                    <CardAction span="header">
                      <Button
                        aria-label={`Edit ${range.name}`}
                        onClick={() => navigate({ to: '/product-ranges/$id/edit', params: { id: range.id } })}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <IconPencil />
                      </Button>
                    </CardAction>
                  ) : null}
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </PageLayout>

      <CreateProductRangeDialog onClose={() => setCreateOpen(false)} open={isCreateOpen} />
    </>
  );
};

type CreateProductRangeDialogProps = {
  open: boolean;
  onClose: () => void;
};

const CreateProductRangeDialog: React.FC<CreateProductRangeDialogProps> = ({ open, onClose }) => (
  <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={open}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>New Product Range</DialogTitle>
        <DialogDescription>Create an admin-managed catalog Range. Add an image on the next screen.</DialogDescription>
      </DialogHeader>
      {open ? <CreateProductRangeForm onClose={onClose} /> : null}
    </DialogContent>
  </Dialog>
);

type CreateProductRangeFormProps = {
  onClose: () => void;
};

// Create is name-only: the Range row must exist before its image can be replaced in place, so the dialog
// creates the Range and then navigates to the edit page where the image is uploaded.
const CreateProductRangeForm: React.FC<CreateProductRangeFormProps> = ({ onClose }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();

  const createMutation = useMutation(
    trpc.productRanges.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Product Range.'),
    }),
  );

  const form = useAppForm({
    defaultValues: { name: '' } satisfies ProductRangeFormValues,
    validators: { onSubmit: ProductRangeFormValues },
    onSubmit: async ({ value }) => {
      const created = await createMutation.mutateAsync(toProductRangeCreateInput(value));
      await invalidateProductRanges();
      onClose();
      toast.success('Product Range created');
      await navigate({ to: '/product-ranges/$id/edit', params: { id: created.id } });
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
      <FieldGroup>
        <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
      </FieldGroup>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(isSubmitting) => (
          <DialogFooter className="mt-4">
            <Button disabled={isSubmitting} onClick={onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSubmitting} type="submit">
              {isSubmitting ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Create
            </Button>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
};
