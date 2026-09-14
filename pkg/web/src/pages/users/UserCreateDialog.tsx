import { hasPermission } from '@pkg/domain';
import { AuthId, type Business } from '@pkg/schema';
import { IconPlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useUserAdminInvalidation } from '@/hooks/use-user-admin-invalidation.js';
import { authClient } from '@/lib/auth-client.js';
import { UserCreateForm, type UserCreateFormValues } from './components/UserCreateForm.js';
import { unwrapAuthResult } from './user-admin-client.js';
import type { UserAdminExtension } from './user-admin-extension.js';

type UserCreateDialogProps = {
  business: Business;
  extension: UserAdminExtension;
};

export const UserCreateDialog: React.FC<UserCreateDialogProps> = ({ business, extension }) => {
  const { invalidateAuth, invalidateUsers } = useUserAdminInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const canSetRole = hasPermission(accessQuery.data, 'user:set-role');
  const [isOpen, setIsOpen] = useState(false);

  const createUserMutation = useMutation({
    mutationFn: async (value: UserCreateFormValues) => {
      const result = unwrapAuthResult<{ user: { id: string } }>(
        await authClient.admin.createUser({
          // Shared-device state belongs in Better Auth's user insert so a later request cannot
          // leave a successfully created account behind while the dialog reports failure.
          data: {
            contractingRole: value.contractingRole,
            emailVerified: value.emailVerified,
            equipmentRole: value.equipmentRole,
            isDevice: canSetRole ? value.isDevice : false,
            phoneNumber: value.phoneNumber,
          },
          email: value.email,
          name: value.name,
          password: value.password,
        }),
      );

      await formExtension.save(AuthId.parse(result.user.id));

      return result;
    },
    onSuccess: async () => {
      await Promise.all([invalidateUsers(), invalidateAuth()]);
      setIsOpen(false);
      toast.success('User created');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to create user.');
    },
  });
  // Declared after the mutation because its fields disable on the mutation's pending flag; the
  // mutation only reads it inside its function, so the late binding is safe.
  const formExtension = extension.useFormExtension({ isPending: createUserMutation.isPending, user: null });

  if (!hasPermission(accessQuery.data, 'user:create')) {
    return null;
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <IconPlus data-icon="inline-start" />
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
              business={business}
              canSetRole={canSetRole}
              extraFields={formExtension.fields}
              isPending={createUserMutation.isPending}
              onSubmit={(value) => createUserMutation.mutateAsync(value)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
