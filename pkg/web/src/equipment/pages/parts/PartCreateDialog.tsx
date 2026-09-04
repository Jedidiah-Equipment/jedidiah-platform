import type { Supplier } from '@pkg/schema/equipment';
import { IconPlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button, type ButtonSize } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartForm } from './components/PartForm.js';
import { toPartInput } from './components/types.js';

type PartCreateDialogProps = {
  supplier: Pick<Supplier, 'companyName' | 'id'>;
  buttonSize?: ButtonSize;
};

export const PartCreateDialog: React.FC<PartCreateDialogProps> = ({ supplier, buttonSize = 'default' }) => {
  const trpc = useTRPC();
  const { invalidateParts } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const [isOpen, setIsOpen] = useState(false);

  const createPartMutation = useMutation(
    trpc.parts.create.mutationOptions({
      onSuccess: async () => {
        await invalidateParts();
        setIsOpen(false);
        toast.success('Part created');
      },
      onError: (error) => {
        showMutationError(error, 'Unable to create part.');
      },
    }),
  );

  return (
    <>
      <Button onClick={() => setIsOpen(true)} size={buttonSize}>
        <IconPlus data-icon="inline-start" />
        New part
      </Button>
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>New part</DialogTitle>
            <DialogDescription>{supplier.companyName}</DialogDescription>
          </DialogHeader>
          {isOpen ? (
            <PartForm
              fixedSupplier={supplier}
              isPending={createPartMutation.isPending}
              onSubmit={(value) => createPartMutation.mutateAsync(toPartInput({ ...value, supplierId: supplier.id }))}
              submitLabel="Create part"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
