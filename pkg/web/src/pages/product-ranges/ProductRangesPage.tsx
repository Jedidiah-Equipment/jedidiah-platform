import { hasPermission } from '@pkg/domain';
import {
  IMAGE_CONTENT_TYPES,
  NullableRangeImageDataUrl,
  type ProductRange,
  ProductRangeName,
  RANGE_IMAGE_DATA_URL_MAX_BYTES,
} from '@pkg/schema';
import { IconLoader2, IconPencil, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { useAppForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
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

// Browser form shape for a Range. Per-field rules defer to the `@pkg/schema` scalars; the server
// re-validates the same constraints on create/update.
const ProductRangeFormValues = z.object({
  imageDataUrl: NullableRangeImageDataUrl,
  name: ProductRangeName,
});
type ProductRangeFormValues = z.infer<typeof ProductRangeFormValues>;

export const ProductRangesPage: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const canCreateRanges = hasPermission(access, 'product_range:create');
  const canUpdateRanges = hasPermission(access, 'product_range:update');

  const rangesQuery = useQuery(trpc.productRanges.list.queryOptions());
  const ranges = rangesQuery.data?.ranges ?? [];

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingRangeId, setEditingRangeId] = useState<string | null>(null);
  const editingRange = editingRangeId ? (ranges.find((range) => range.id === editingRangeId) ?? null) : null;

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
                    <EntityThumbnail label={range.name} size="lg" thumbnailDataUrl={range.imageDataUrl} />
                    <div className="min-w-0 space-y-0.5">
                      <CardTitle className="truncate">{range.name}</CardTitle>
                      <CardDescription>{range.imageDataUrl ? 'Image attached' : 'No image'}</CardDescription>
                    </div>
                  </div>
                  {canUpdateRanges ? (
                    <CardAction span="header">
                      <Button
                        aria-label={`Edit ${range.name}`}
                        onClick={() => setEditingRangeId(range.id)}
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
      <EditProductRangeDialog range={editingRange} onClose={() => setEditingRangeId(null)} />
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
        <DialogDescription>Create an admin-managed catalog Range.</DialogDescription>
      </DialogHeader>
      {open ? <ProductRangeForm mode="create" onClose={onClose} /> : null}
    </DialogContent>
  </Dialog>
);

type EditProductRangeDialogProps = {
  range: ProductRange | null;
  onClose: () => void;
};

const EditProductRangeDialog: React.FC<EditProductRangeDialogProps> = ({ range, onClose }) => (
  <Dialog onOpenChange={(nextOpen) => !nextOpen && onClose()} open={range !== null}>
    <DialogContent className="sm:max-w-[480px]">
      <DialogHeader>
        <DialogTitle>Edit Product Range</DialogTitle>
        <DialogDescription>{range?.name ?? null}</DialogDescription>
      </DialogHeader>
      {range ? <ProductRangeForm key={range.id} mode="edit" onClose={onClose} range={range} /> : null}
    </DialogContent>
  </Dialog>
);

type ProductRangeFormProps =
  | {
      mode: 'create';
      onClose: () => void;
    }
  | {
      mode: 'edit';
      onClose: () => void;
      range: ProductRange;
    };

const ProductRangeForm: React.FC<ProductRangeFormProps> = (props) => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();

  const createMutation = useMutation(
    trpc.productRanges.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Product Range.'),
    }),
  );
  const updateMutation = useMutation(
    trpc.productRanges.update.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to update Product Range.'),
    }),
  );

  const defaultValues: ProductRangeFormValues =
    props.mode === 'edit'
      ? { imageDataUrl: props.range.imageDataUrl, name: props.range.name }
      : { imageDataUrl: null, name: '' };

  const form = useAppForm({
    defaultValues,
    validators: { onSubmit: ProductRangeFormValues },
    onSubmit: async ({ value }) => {
      const input = { imageDataUrl: value.imageDataUrl, name: value.name.trim() };

      if (props.mode === 'create') {
        await createMutation.mutateAsync(input);
        await invalidateProductRanges();
        props.onClose();
        toast.success('Product Range created');
        return;
      }

      await updateMutation.mutateAsync({ ...input, id: props.range.id });
      await invalidateProductRanges();
      props.onClose();
      toast.success('Product Range updated');
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
        <form.Subscribe selector={(state) => state.values.name}>
          {(name) => (
            <form.AppField name="imageDataUrl">
              {(field) => (
                <field.ImageField
                  contentTypes={IMAGE_CONTENT_TYPES}
                  fallbackLabel={name || 'Product Range'}
                  label="Image"
                  maxBytes={RANGE_IMAGE_DATA_URL_MAX_BYTES}
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
      </FieldGroup>
      {/* `isDefaultValue` is equality-to-defaults; unlike `isDirty` it returns to true when the user
          reverts a field, so reverting an edit re-disables Save instead of submitting a no-op update. */}
      <form.Subscribe selector={(state) => ({ isDefaultValue: state.isDefaultValue, isSubmitting: state.isSubmitting })}>
        {({ isDefaultValue, isSubmitting }) => (
          <DialogFooter className="mt-4">
            <Button disabled={isSubmitting} onClick={props.onClose} type="button" variant="outline">
              Cancel
            </Button>
            <Button disabled={isSubmitting || (props.mode === 'edit' && isDefaultValue)} type="submit">
              {isSubmitting ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              Save
            </Button>
          </DialogFooter>
        )}
      </form.Subscribe>
    </form>
  );
};
