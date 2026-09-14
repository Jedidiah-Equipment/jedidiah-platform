import { hasPermission } from '@pkg/domain';
import type { Business, UserAccount } from '@pkg/schema';
import { IconLoader2, IconMailCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useUserAdminInvalidation } from '@/hooks/use-user-admin-invalidation.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';
import { UserEditForm, type UserEditFormValues } from './components/UserEditForm.js';
import type { UserPasswordFormValues } from './components/UserPasswordForm.js';
import { AuthAdminError, unwrapAuthResult } from './user-admin-client.js';
import type { UserAdminExtension } from './user-admin-extension.js';

type UserEditDialogProps = {
  business: Business;
  extension: UserAdminExtension;
  user: UserAccount;
  onClose: () => void;
};

export const UserEditDialog: React.FC<UserEditDialogProps> = ({ business, extension, user, onClose }) => {
  const trpc = useTRPC();
  const { invalidateAuth, invalidateUsers } = useUserAdminInvalidation();
  const accessQuery = useAccess();
  const showMutationError = useApiMutationErrorToast();
  const access = accessQuery.data;
  const [baselineUser, setBaselineUser] = useState(user);
  const [roleError, setRoleError] = useState<string | null>(null);
  const formId = useId();

  const canUpdateProfile = hasPermission(access, 'user:update');
  const canSetEmail = hasPermission(access, 'user:set-email');
  const canSetRole = hasPermission(access, 'user:set-role');
  const canSetPassword = hasPermission(access, 'user:set-password');
  const canSaveUser = canUpdateProfile || canSetEmail || canSetRole;
  const setDeviceMutation = useMutation(trpc.users.setDevice.mutationOptions());
  const updateThumbnailMutation = useMutation(trpc.users.updateThumbnail.mutationOptions());

  useEffect(() => {
    setBaselineUser(user);
    setRoleError(null);
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
      const profileData = buildProfileUpdateData({ baselineUser, canSetEmail, canSetRole, canUpdateProfile, value });
      const thumbnailChanged = value.thumbnailDataUrl !== baselineUser.thumbnailDataUrl;

      if (Object.keys(profileData).length > 0) {
        await unwrapAuthResult(
          await authClient.admin.updateUser({
            data: profileData,
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

      if (canSetRole && value.isDevice !== baselineUser.isDevice) {
        await setDeviceMutation.mutateAsync({ isDevice: value.isDevice, userId: baselineUser.id });
        didUpdate = true;
      }

      if (await formExtension.save(baselineUser.id)) {
        didUpdate = true;
      }

      return { didUpdate, value };
    },
    onSuccess: async ({ didUpdate, value }) => {
      if (!didUpdate) {
        toast.info('No user changes to save');
        onClose();
        return;
      }

      setBaselineUser((currentUser) => ({
        ...currentUser,
        ...value,
      }));
      setRoleError(null);
      await refreshUser();
      toast.success('User updated');
      onClose();
    },
    onError: (error) => {
      if (isOpenBayOperatorAssignmentRoleError(error)) {
        setRoleError(error.message);
        return;
      }

      showMutationError(error, 'Unable to update user.');
    },
  });
  const formExtension = extension.useFormExtension({ isPending: saveUserMutation.isPending, user: baselineUser });

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
        <ScrollArea className="-mx-4 max-h-[50vh] px-4">
          <UserEditForm
            business={business}
            canSetEmail={canSetEmail}
            canSetPassword={canSetPassword}
            canSetRole={canSetRole}
            canUpdateProfile={canUpdateProfile}
            extraFields={formExtension.fields}
            formId={formId}
            initialUser={baselineUser}
            isPasswordPending={setPasswordMutation.isPending}
            isPending={saveUserMutation.isPending}
            onPasswordSubmit={(value) => setPasswordMutation.mutateAsync(value)}
            onRoleChange={() => setRoleError(null)}
            onSubmit={(value) => saveUserMutation.mutateAsync(value)}
            roleError={roleError}
          />
          {formExtension.actions}
          {canUpdateProfile && !baselineUser.emailVerified ? (
            <Button
              className="mt-4 w-full"
              disabled={sendVerificationMutation.isPending}
              onClick={() => sendVerificationMutation.mutate({ userId: baselineUser.id })}
              variant="outline"
            >
              <IconMailCheck data-icon="inline-start" />
              {sendVerificationMutation.isPending ? 'Sending' : 'Send verification email'}
            </Button>
          ) : null}
        </ScrollArea>
        {canSaveUser ? (
          <DialogFooter showCloseButton>
            <Button disabled={saveUserMutation.isPending} form={formId} type="submit">
              {saveUserMutation.isPending ? <IconLoader2 data-icon="inline-start" className="animate-spin" /> : null}
              Save user
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};

function isOpenBayOperatorAssignmentRoleError(error: unknown): error is AuthAdminError {
  return error instanceof AuthAdminError && error.code === 'USER_HAS_OPEN_BAY_OPERATOR_ASSIGNMENTS';
}

type ProfileUpdateData = Partial<
  Pick<
    UserEditFormValues,
    'assistantEnabled' | 'contractingRole' | 'email' | 'emailVerified' | 'equipmentRole' | 'name' | 'phoneNumber'
  >
>;

function buildProfileUpdateData({
  baselineUser,
  canSetEmail,
  canSetRole,
  canUpdateProfile,
  value,
}: {
  baselineUser: UserAccount;
  canSetEmail: boolean;
  canSetRole: boolean;
  canUpdateProfile: boolean;
  value: UserEditFormValues;
}): ProfileUpdateData {
  const data: ProfileUpdateData = {};

  // Better Auth protects email under `user:set-email`; unchanged sensitive fields must stay out of
  // ordinary name/phone saves so those edits only require `user:update`.
  if (canSetEmail && value.email !== baselineUser.email) {
    data.email = value.email;
  }
  if (canSetEmail && value.emailVerified !== baselineUser.emailVerified) {
    data.emailVerified = value.emailVerified;
  }
  if (canUpdateProfile && value.name !== baselineUser.name) {
    data.name = value.name;
  }
  if (canUpdateProfile && value.phoneNumber !== baselineUser.phoneNumber) {
    data.phoneNumber = value.phoneNumber;
  }
  if (canUpdateProfile && value.assistantEnabled !== baselineUser.assistantEnabled) {
    data.assistantEnabled = value.assistantEnabled;
  }
  // Only the slot of the business this dialog stands in is shown, so at most one of these moves.
  if (canSetRole && value.equipmentRole !== baselineUser.equipmentRole) {
    data.equipmentRole = value.equipmentRole;
  }
  if (canSetRole && value.contractingRole !== baselineUser.contractingRole) {
    data.contractingRole = value.contractingRole;
  }

  return data;
}
