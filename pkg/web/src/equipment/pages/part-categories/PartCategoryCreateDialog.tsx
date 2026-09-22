import { type PartCategory, PartCategoryCreateInput } from '@pkg/schema/equipment';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';

import { CreateEntityDialog } from '@/components/form/index.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

/** Adds a Part Category from its admin page; a Part's picker creates one inline instead. */
export function PartCategoryCreateDialog({
  onCreated,
  onOpenChange,
  open,
}: {
  onCreated: (category: PartCategory) => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const trpc = useTRPC();
  const { invalidatePartCategories } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const mutation = useMutation(
    trpc.partCategories.create.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to create Part Category.'),
    }),
  );

  return (
    <CreateEntityDialog<PartCategoryCreateInput, PartCategory>
      defaultValues={{ name: '' }}
      onCreate={(values) => mutation.mutateAsync(values)}
      onCreated={async (category) => {
        await invalidatePartCategories();
        onOpenChange(false);
        toast.success('Part Category created');
        await onCreated(category);
      }}
      onOpenChange={onOpenChange}
      open={open}
      submitLabel="Create"
      title="New Part Category"
      validator={PartCategoryCreateInput}
    >
      {(form) => (
        <form.AppField name="name">{(field) => <field.TextField autoComplete="off" label="Name" />}</form.AppField>
      )}
    </CreateEntityDialog>
  );
}
