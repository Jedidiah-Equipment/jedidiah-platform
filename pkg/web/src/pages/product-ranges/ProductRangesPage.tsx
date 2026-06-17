import { hasPermission } from '@pkg/domain';
import { type ProductRange, RANGE_IMAGE_DATA_URL_MAX_BYTES } from '@pkg/schema';
import { IconLoader2, IconPencil, IconPhoto, IconPlus, IconTrash, IconUpload } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useId, useRef, useState } from 'react';
import { toast } from 'sonner';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { Input } from '@/components/ui/input.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { productRangesPageDescription } from '@/utils/page-descriptions.js';

type ProductRangeFormValue = {
  imageDataUrl: string | null;
  name: string;
};

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
  const initialValue: ProductRangeFormValue =
    props.mode === 'edit'
      ? { imageDataUrl: props.range.imageDataUrl, name: props.range.name }
      : { imageDataUrl: null, name: '' };
  const [value, setValue] = useState<ProductRangeFormValue>(initialValue);

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

  const isPending = createMutation.isPending || updateMutation.isPending;
  const canSubmit = Boolean(value.name.trim());
  const formId = props.mode === 'edit' ? `edit-product-range-form-${props.range.id}` : 'create-product-range-form';

  const save = async () => {
    const input = {
      imageDataUrl: value.imageDataUrl,
      name: value.name,
    };

    if (props.mode === 'create') {
      await createMutation.mutateAsync(input);
      await invalidateProductRanges();
      props.onClose();
      toast.success('Product Range created');
      return;
    }

    if (value.name.trim() === props.range.name && value.imageDataUrl === props.range.imageDataUrl) {
      toast.info('No Product Range changes to save');
      return;
    }

    await updateMutation.mutateAsync({ ...input, id: props.range.id });
    await invalidateProductRanges();
    props.onClose();
    toast.success('Product Range updated');
  };

  return (
    <>
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault();
          void save().catch(() => undefined);
        }}
      >
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
            <Input
              autoComplete="off"
              disabled={isPending}
              id={`${formId}-name`}
              onChange={(event) => setValue((current) => ({ ...current, name: event.currentTarget.value }))}
              value={value.name}
            />
          </Field>
          <ProductRangeImagePicker
            disabled={isPending}
            id={`${formId}-image`}
            imageDataUrl={value.imageDataUrl}
            label={value.name || 'Product Range'}
            onChange={(imageDataUrl) => setValue((current) => ({ ...current, imageDataUrl }))}
          />
        </FieldGroup>
      </form>
      <DialogFooter>
        <Button disabled={isPending} onClick={props.onClose} type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isPending || !canSubmit} form={formId} type="submit">
          {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
          Save
        </Button>
      </DialogFooter>
    </>
  );
};

type ProductRangeImagePickerProps = {
  disabled: boolean;
  id?: string;
  imageDataUrl: string | null;
  label: string;
  onChange: (imageDataUrl: string | null) => void;
};

const ProductRangeImagePicker: React.FC<ProductRangeImagePickerProps> = ({
  disabled,
  id,
  imageDataUrl,
  label,
  onChange,
}) => {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Product Range image must be a JPEG or PNG.');
      return;
    }

    if (file.size > RANGE_IMAGE_DATA_URL_MAX_BYTES) {
      toast.error('Product Range image must be 512 KB or smaller.');
      return;
    }

    setIsProcessing(true);

    try {
      onChange(await readFileAsDataUrl(file));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to read Product Range image.');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>Image</FieldLabel>
      <div className="flex items-center gap-3">
        <EntityThumbnail label={label} size="lg" thumbnailDataUrl={imageDataUrl} />
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Input
            accept="image/jpeg,image/png"
            className="sr-only"
            disabled={disabled || isProcessing}
            id={inputId}
            onChange={handleFileChange}
            ref={inputRef}
            type="file"
          />
          <Button
            disabled={disabled || isProcessing}
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="outline"
          >
            {imageDataUrl ? <IconPhoto data-icon="inline-start" /> : <IconUpload data-icon="inline-start" />}
            {imageDataUrl ? 'Replace' : 'Upload'}
          </Button>
          {imageDataUrl ? (
            <Button
              aria-label="Remove Product Range image"
              disabled={disabled || isProcessing}
              onClick={() => onChange(null)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <IconTrash />
            </Button>
          ) : null}
        </div>
      </div>
    </Field>
  );
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Unable to read Product Range image.'));
      }
    });
    reader.addEventListener('error', () => reject(new Error('Unable to read Product Range image.')));
    reader.readAsDataURL(file);
  });
}
