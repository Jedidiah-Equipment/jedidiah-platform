import type { Part, Supplier } from '@pkg/schema';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartForm } from './components/PartForm.js';
import { toPartInput } from './components/types.js';
import { PartLabelPrintButton } from './PartLabelPrintButton.js';

type PartEditDialogProps = {
  onClose: () => void;
  part: Part | null;
  supplier: Pick<Supplier, 'companyName' | 'id'>;
};

export const PartEditDialog: React.FC<PartEditDialogProps> = ({ onClose, part, supplier }) => {
  const trpc = useTRPC();
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
              <DialogDescription>{supplier.companyName}</DialogDescription>
            </div>
            {part ? <PartLabelPrintButton partId={part.id} size="sm" /> : null}
          </div>
        </DialogHeader>
        {part ? (
          <PartForm
            fixedSupplier={supplier}
            initialPart={part}
            isPending={updatePartMutation.isPending}
            key={part.id}
            onSubmit={(value) =>
              updatePartMutation.mutateAsync({
                ...toPartInput({
                  ...value,
                  supplierId: supplier.id,
                }),
                id: part.id,
              })
            }
            submitLabel="Save part"
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
