import type { Part, Supplier } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartBomTab } from './components/PartBomTab.js';
import { PartForm } from './components/PartForm.js';
import { type PartFormValues, toPartInput } from './components/types.js';
import { PartLabelPrintButton } from './PartLabelPrintButton.js';

type PartEditDialogProps = {
  onClose: () => void;
  part: Part | null;
  /** Null on a built Part, which is made in-house and bought from nobody. */
  supplier: Pick<Supplier, 'companyName' | 'id'> | null;
};

export const PartEditDialog: React.FC<PartEditDialogProps> = ({ onClose, part, supplier }) => {
  const trpc = useTRPC();
  const canUpdatePart = useCan('part:update').can;
  const { invalidateParts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const updatePartMutation = useMutation(
    trpc.parts.update.mutationOptions({
      onSuccess: async () => {
        await invalidateParts();
        onClose();
        toast.success('Part updated');
      },
      onError: (error) => {
        showMutationError(error, 'Unable to update part.');
      },
    }),
  );

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={!!part}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle>Edit part</DialogTitle>
              <DialogDescription>{supplier?.companyName ?? 'Built in-house'}</DialogDescription>
            </div>
            {part ? <PartLabelPrintButton partId={part.id} size="sm" /> : null}
          </div>
        </DialogHeader>
        {part ? (
          <PartEditBody
            canUpdatePart={canUpdatePart}
            isPending={updatePartMutation.isPending}
            key={part.id}
            onSubmit={(value) =>
              updatePartMutation.mutateAsync({
                // Only a dialog that really is supplier-scoped pins the Supplier. A built Part has
                // none, and forcing '' here would block converting it back to a bought one.
                ...toPartInput(supplier ? { ...value, supplierId: supplier.id } : value),
                id: part.id,
              })
            }
            part={part}
            supplier={supplier}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

/**
 * A bought Part has one screen and no tab strip to choose between; only a built Part carries a Bill
 * of Materials. Splitting on that once here keeps the two shapes legible rather than asking the same
 * question at every level of one tree.
 */
const PartEditBody: React.FC<{
  canUpdatePart: boolean;
  isPending: boolean;
  onSubmit: (value: PartFormValues) => Promise<unknown>;
  part: Part;
  supplier: Pick<Supplier, 'companyName' | 'id'> | null;
}> = ({ canUpdatePart, isPending, onSubmit, part, supplier }) => {
  const details = (
    <PartForm
      fixedSupplier={supplier ?? undefined}
      initialPart={part}
      isPending={isPending}
      onSubmit={onSubmit}
      submitLabel="Save part"
    />
  );

  if (!part.isInternallyFabricated) return details;

  return (
    <Tabs defaultValue="details">
      <TabsList>
        <TabsTrigger value="details">Details</TabsTrigger>
        <TabsTrigger value="bom">Bill of Materials</TabsTrigger>
      </TabsList>
      <TabsContent value="details">{details}</TabsContent>
      <TabsContent value="bom">
        <PartBomTab canEdit={canUpdatePart} partId={part.id} />
      </TabsContent>
    </Tabs>
  );
};
