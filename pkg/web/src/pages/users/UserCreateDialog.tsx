import { hasPermission } from '@pkg/domain';
import { AuthId } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';
import { UserCreateForm, type UserCreateFormValues } from './components/UserCreateForm.js';
import { unwrapAuthResult } from './user-admin-client.js';

export const UserCreateDialog: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const canAssignDepartments = hasPermission(accessQuery.data, 'user:assign-departments');
  const [isOpen, setIsOpen] = useState(false);
  const setDepartmentsMutation = useMutation(trpc.users.setDepartments.mutationOptions());

  const createUserMutation = useMutation({
    mutationFn: async (value: UserCreateFormValues) => {
      const result = unwrapAuthResult<{ user: { id: string } }>(
        await authClient.admin.createUser({
          data: { emailVerified: value.emailVerified },
          email: value.email,
          name: value.name,
          password: value.password,
          role: value.role,
        }),
      );

      if (canAssignDepartments) {
        await setDepartmentsMutation.mutateAsync({
          departments: value.departments,
          userId: AuthId.parse(result.user.id),
        });
      }

      return result;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(trpc.users.list.queryFilter()),
        queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
      ]);
      setIsOpen(false);
      toast.success('User created');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to create user.');
    },
  });

  if (!hasPermission(accessQuery.data, 'user:create')) {
    return null;
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        New user
      </Button>
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>Create a user with email/password access.</DialogDescription>
          </DialogHeader>
          {isOpen ? (
            <UserCreateForm
              canAssignDepartments={canAssignDepartments}
              isPending={createUserMutation.isPending}
              onSubmit={(value) => createUserMutation.mutateAsync(value)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
