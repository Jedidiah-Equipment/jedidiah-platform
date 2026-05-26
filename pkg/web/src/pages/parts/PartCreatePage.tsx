import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartForm } from './components/PartForm.js';

export const PartCreatePage: React.FC = () => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const showMutationError = useApiMutationErrorToast();

  const createPartMutation = useMutation(
    trpc.parts.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.parts.pathKey() });
        toast.success('Part created');
        await navigate({ to: '/parts' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to create part.');
      },
    }),
  );

  return (
    <EditPageLayout back={<BackButton to="/parts">Parts</BackButton>} description="Inventory" title="New part">
      <PartForm
        isPending={createPartMutation.isPending}
        onSubmit={(value) =>
          createPartMutation.mutateAsync({
            ...value,
            drawingCode: value.drawingCode || null,
          })
        }
        submitLabel="Create part"
      />
    </EditPageLayout>
  );
};
