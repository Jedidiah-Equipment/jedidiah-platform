import type { Supplier } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartForm } from './components/PartForm.js';

type PartCreateDialogProps = {
  supplier: Pick<Supplier, 'companyName' | 'id'>;
};

export const PartCreateDialog: React.FC<PartCreateDialogProps> = ({ supplier }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const showMutationError = useApiMutationErrorToast();
  const [isOpen, setIsOpen] = useState(false);

  const createPartMutation = useMutation(
    trpc.parts.create.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.parts.list.queryFilter()),
          queryClient.invalidateQueries(trpc.parts.categories.queryFilter()),
        ]);
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
      <Button onClick={() => setIsOpen(true)}>
        <PlusIcon data-icon="inline-start" />
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
              onSubmit={(value) =>
                createPartMutation.mutateAsync({
                  ...value,
                  drawingCode: value.drawingCode || null,
                  supplierId: supplier.id,
                })
              }
              submitLabel="Create part"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
