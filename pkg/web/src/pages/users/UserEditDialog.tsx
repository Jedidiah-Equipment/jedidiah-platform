import { hasPermission } from '@pkg/domain';
import type { Department, UserSummary } from '@pkg/schema';
import { IconMailCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';
import { UserEditForm, type UserEditFormValues } from './components/UserEditForm.js';
import type { UserPasswordFormValues } from './components/UserPasswordForm.js';
import { unwrapAuthResult } from './user-admin-client.js';

type UserEditDialogProps = {
  user: UserSummary;
  onClose: () => void;
};

export const UserEditDialog: React.FC<UserEditDialogProps> = ({ user, onClose }) => {
  const trpc = useTRPC();
  const { invalidateAuth, invalidateUsers } = useQueryInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const access = accessQuery.data;
  const [baselineUser, setBaselineUser] = useState(user);

  const canUpdateProfile = hasPermission(access, 'user:update');
  const canAssignDepartments = hasPermission(access, 'user:assign-departments');
  const canSetRole = hasPermission(access, 'user:set-role');
  const canSetPassword = hasPermission(access, 'user:set-password');
  const setDepartmentsMutation = useMutation(trpc.users.setDepartments.mutationOptions());
  const updateThumbnailMutation = useMutation(trpc.users.updateThumbnail.mutationOptions());

  useEffect(() => {
    setBaselineUser(user);
  }, [user]);

  const refreshUser = async () => {
    await Promise.all([
      invalidateUsers(),
      invalidateAuth(),
      user?.id === access?.userId ? authClient.getSession() : Promise.resolve(),
    ]);
  };

  const saveUserMutation = useMutation({
    mutationFn: async (value: UserEditFormValues) => {
      let didUpdate = false;
      const profileChanged =
        value.email !== baselineUser.email ||
        value.emailVerified !== baselineUser.emailVerified ||
        value.name !== baselineUser.name ||
        value.phoneNumber !== baselineUser.phoneNumber;
      const thumbnailChanged = value.thumbnailDataUrl !== baselineUser.thumbnailDataUrl;

      if (canUpdateProfile && profileChanged) {
        await unwrapAuthResult(
          await authClient.admin.updateUser({
            data: {
              email: value.email,
              emailVerified: value.emailVerified,
              name: value.name,
              phoneNumber: value.phoneNumber,
            },
            userId: baselineUser.id,
          }),
        );
        didUpdate = true;
      }

      if (canUpdateProfile && thumbnailChanged) {
        await updateThumbnailMutation.mutateAsync({
          thumbnailDataUrl: value.thumbnailDataUrl,
          userId: baselineUser.id,
        });
        didUpdate = true;
      }

      if (canSetRole && value.role !== baselineUser.role) {
        await unwrapAuthResult(await authClient.admin.setRole({ role: value.role, userId: baselineUser.id }));
        didUpdate = true;
      }

      if (canAssignDepartments && haveDepartmentsChanged(value.departments, baselineUser.departments)) {
        await setDepartmentsMutation.mutateAsync({
          departments: value.departments,
          userId: baselineUser.id,
        });
        didUpdate = true;
      }

      return { didUpdate, value };
    },
    onSuccess: async ({ didUpdate, value }) => {
      if (!didUpdate) {
        toast.info('No user changes to save');
        return;
      }

      setBaselineUser((currentUser) => ({
        ...currentUser,
        ...value,
      }));
      await refreshUser();
      toast.success('User updated');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to update user.');
    },
  });

  const sendVerificationMutation = useMutation({
    ...trpc.users.sendVerificationEmail.mutationOptions(),
    onSuccess: async () => {
      toast.success('Verification email sent');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to send verification email.');
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (value: UserPasswordFormValues) =>
      unwrapAuthResult(await authClient.admin.setUserPassword({ newPassword: value.newPassword, userId: user.id })),
    onSuccess: async () => {
      await refreshUser();
      toast.success('User password updated');
    },
    onError: (error) => {
      showMutationError(error, 'Unable to update user password.');
    },
  });

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={!!user}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <UserEditForm
          canAssignDepartments={canAssignDepartments}
          canSetPassword={canSetPassword}
          canSetRole={canSetRole}
          canUpdateProfile={canUpdateProfile}
          initialUser={baselineUser}
          isPasswordPending={setPasswordMutation.isPending}
          isPending={saveUserMutation.isPending}
          onPasswordSubmit={(value) => setPasswordMutation.mutateAsync(value)}
          onSubmit={(value) => saveUserMutation.mutateAsync(value)}
        />
        {canUpdateProfile && !baselineUser.emailVerified ? (
          <Button
            className="w-full"
            disabled={sendVerificationMutation.isPending}
            onClick={() => sendVerificationMutation.mutate({ userId: baselineUser.id })}
            variant="outline"
          >
            <IconMailCheck data-icon="inline-start" />
            {sendVerificationMutation.isPending ? 'Sending' : 'Send verification email'}
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

function haveDepartmentsChanged(left: readonly Department[], right: readonly Department[]) {
  if (left.length !== right.length) {
    return true;
  }

  const rightDepartments = new Set(right);
  return left.some((department) => !rightDepartments.has(department));
}
