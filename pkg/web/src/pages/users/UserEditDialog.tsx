import { hasPermission } from '@pkg/domain';
import type { Department, UserSummary } from '@pkg/schema';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type React from 'react';
import { toast } from 'sonner';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useAccess } from '@/hooks/use-access.js';
import { authClient } from '@/lib/auth-client.js';
import { useTRPC } from '@/lib/trpc.js';
import { UserDepartmentsForm } from './components/UserDepartmentsForm.js';
import { UserPasswordForm, type UserPasswordFormValues } from './components/UserPasswordForm.js';
import { UserProfileForm, type UserProfileFormValues } from './components/UserProfileForm.js';
import { UserRoleForm, type UserRoleFormValues } from './components/UserRoleForm.js';
import { unwrapAuthResult } from './user-admin-client.js';

type UserEditDialogProps = {
  user: UserSummary;
  onClose: () => void;
};

export const UserEditDialog: React.FC<UserEditDialogProps> = ({ user, onClose }) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const access = accessQuery.data;

  const canUpdateProfile = hasPermission(access, 'user:update');
  const canAssignDepartments = hasPermission(access, 'user:assign-departments');
  const canSetRole = hasPermission(access, 'user:set-role');
  const canSetPassword = hasPermission(access, 'user:set-password');

  const refreshUser = async () => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.users.list.queryFilter()),
      queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
      user?.id === access?.userId ? authClient.getSession() : Promise.resolve(),
    ]);
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (value: UserProfileFormValues) =>
      unwrapAuthResult(await authClient.admin.updateUser({ data: value, userId: user.id })),
    onSuccess: async () => {
      await refreshUser();
      toast.success('User profile updated');
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: async (value: UserRoleFormValues) =>
      unwrapAuthResult(await authClient.admin.setRole({ role: value.role, userId: user.id })),
    onSuccess: async () => {
      await refreshUser();
      toast.success('User role updated');
    },
    onError: (error) => {
      toast.error(error.message);
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
      toast.error(error.message);
    },
  });

  const setDepartmentsMutation = useMutation(
    trpc.users.setDepartments.mutationOptions({
      onSuccess: async () => {
        await refreshUser();
        toast.success('User departments updated');
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const setDepartments = (departments: readonly Department[]) => {
    return setDepartmentsMutation.mutateAsync({
      departments: [...departments],
      userId: user.id,
    });
  };

  const defaultTab = canUpdateProfile ? 'profile' : canSetRole ? 'role' : canSetPassword ? 'password' : 'departments';

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={!!user}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full">
            {canUpdateProfile ? <TabsTrigger value="profile">Profile</TabsTrigger> : null}
            {canSetRole ? <TabsTrigger value="role">Role</TabsTrigger> : null}
            {canSetPassword ? <TabsTrigger value="password">Password</TabsTrigger> : null}
            {canAssignDepartments ? <TabsTrigger value="departments">Departments</TabsTrigger> : null}
          </TabsList>
          {canUpdateProfile ? (
            <TabsContent value="profile">
              <UserProfileForm
                initialUser={user}
                isPending={updateProfileMutation.isPending}
                onSubmit={(value) => updateProfileMutation.mutateAsync(value)}
              />
            </TabsContent>
          ) : null}
          {canSetRole ? (
            <TabsContent value="role">
              <UserRoleForm
                initialUser={user}
                isPending={setRoleMutation.isPending}
                onSubmit={(value) => setRoleMutation.mutateAsync(value)}
              />
            </TabsContent>
          ) : null}
          {canSetPassword ? (
            <TabsContent value="password">
              <UserPasswordForm
                isPending={setPasswordMutation.isPending}
                onSubmit={(value) => setPasswordMutation.mutateAsync(value)}
              />
            </TabsContent>
          ) : null}
          {canAssignDepartments ? (
            <TabsContent value="departments">
              <UserDepartmentsForm
                initialDepartments={user.departments}
                isPending={setDepartmentsMutation.isPending}
                onDepartmentsChange={setDepartments}
              />
            </TabsContent>
          ) : null}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
