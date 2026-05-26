import type { UUID } from '@pkg/schema';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type React from 'react';
import { toast } from 'sonner';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EditPageLayout } from '@/components/page-layout/EditPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { PartForm } from './components/PartForm.js';

type PartEditPageProps = {
  partId: UUID;
};

export const PartEditPage: React.FC<PartEditPageProps> = ({ partId }) => {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const showMutationError = useApiMutationErrorToast();

  const partQuery = useQuery(trpc.parts.get.queryOptions({ id: partId }));

  const updatePartMutation = useMutation(
    trpc.parts.update.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: trpc.parts.pathKey() });
        toast.success('Part updated');
        await navigate({ to: '/parts' });
      },
      onError: (error) => {
        showMutationError(error, 'Unable to update part.');
      },
    }),
  );

  return (
    <EditPageLayout back={<BackButton to="/parts">Parts</BackButton>} description="Inventory" title="Edit part">
      {partQuery.isPending ? <PartFormSkeleton /> : null}
      <ErrorMessage error={partQuery.error} fallbackMessage="Unable to load part." />
      {partQuery.data ? (
        <PartForm
          initialPart={partQuery.data}
          isPending={updatePartMutation.isPending}
          key={partQuery.data.id}
          onSubmit={(value) =>
            updatePartMutation.mutateAsync({
              ...value,
              drawingCode: value.drawingCode || null,
              id: partQuery.data.id,
            })
          }
          submitLabel="Save part"
        />
      ) : null}
    </EditPageLayout>
  );
};

function PartFormSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
