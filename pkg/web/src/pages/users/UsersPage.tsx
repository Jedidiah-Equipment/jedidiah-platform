import { hasPermission, type UserSummary } from "@pkg/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, ShieldIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Separator } from "@/components/ui/separator.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { useAccess } from "@/hooks/use-access.js";
import { authClient } from "@/lib/auth-client.js";
import { useTRPC } from "@/lib/trpc.js";
import {
  UserCreateForm,
  type UserCreateFormValues,
  UserPasswordForm,
  type UserPasswordFormValues,
  UserProfileForm,
  type UserProfileFormValues,
  UserRoleForm,
  type UserRoleFormValues,
} from "./components/UserForm.js";
import { UserTable } from "./components/UserTable.js";

const emptyUsers: UserSummary[] = [];

export const UsersPage: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const canCreateUsers = hasPermission(access, "user:create");
  const canUpdateUsers = hasPermission(access, "user:update");
  const canSetUserRoles = hasPermission(access, "user:set-role");
  const canSetUserPasswords = hasPermission(access, "user:set-password");
  const canManageUsers = canUpdateUsers || canSetUserRoles || canSetUserPasswords;
  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);

  const refreshUsers = async (targetUserId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries(trpc.users.list.queryFilter()),
      queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
      targetUserId === access?.userId ? authClient.getSession() : Promise.resolve(),
    ]);
  };

  const createUserMutation = useMutation({
    mutationFn: async (value: UserCreateFormValues) =>
      unwrapAuthResult(
        await adminUserClient.createUser({
          data: {
            emailVerified: value.emailVerified,
          },
          email: value.email,
          name: value.name,
          password: value.password,
          role: value.role,
        }),
      ),
    onSuccess: async () => {
      await refreshUsers();
      setIsCreateOpen(false);
      toast.success("User created");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (value: UserProfileFormValues) => {
      if (!editingUser) {
        return null;
      }

      return unwrapAuthResult(
        await adminUserClient.updateUser({
          data: value,
          userId: editingUser.id,
        }),
      );
    },
    onSuccess: async () => {
      await refreshUsers(editingUser?.id);
      toast.success("User profile updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setRoleMutation = useMutation({
    mutationFn: async (value: UserRoleFormValues) => {
      if (!editingUser) {
        return null;
      }

      return unwrapAuthResult(
        await adminUserClient.setRole({
          role: value.role,
          userId: editingUser.id,
        }),
      );
    },
    onSuccess: async () => {
      await refreshUsers(editingUser?.id);
      toast.success("User role updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: async (value: UserPasswordFormValues) => {
      if (!editingUser) {
        return null;
      }

      return unwrapAuthResult(
        await adminUserClient.setUserPassword({
          newPassword: value.newPassword,
          userId: editingUser.id,
        }),
      );
    },
    onSuccess: async () => {
      await refreshUsers(editingUser?.id);
      toast.success("User password updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardDescription>Access</CardDescription>
              <CardTitle>Users</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <ShieldIcon data-icon="inline-start" />
                User access
              </Badge>
              {canCreateUsers ? (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <PlusIcon data-icon="inline-start" />
                  New user
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <UserTable
            currentUserId={accessQuery.data?.userId}
            errorMessage={usersQuery.error?.message}
            isLoading={usersQuery.isPending}
            onEditUser={canManageUsers ? setEditingUser : undefined}
            showEditActions={canManageUsers}
            users={usersQuery.data?.users ?? emptyUsers}
          />
        </CardContent>
      </Card>

      <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>Create a user with email/password access.</DialogDescription>
          </DialogHeader>
          {isCreateOpen ? (
            <UserCreateForm
              isPending={createUserMutation.isPending}
              onSubmit={(value) => createUserMutation.mutateAsync(value)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(isOpen) => !isOpen && setEditingUser(null)} open={!!editingUser}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{editingUser?.email}</DialogDescription>
          </DialogHeader>
          {editingUser ? (
            <UserEditTabs
              canSetPassword={canSetUserPasswords}
              canSetRole={canSetUserRoles}
              canUpdateProfile={canUpdateUsers}
              isPasswordPending={setPasswordMutation.isPending}
              isProfilePending={updateProfileMutation.isPending}
              isRolePending={setRoleMutation.isPending}
              onPasswordSubmit={(value) => setPasswordMutation.mutateAsync(value)}
              onProfileSubmit={(value) => updateProfileMutation.mutateAsync(value)}
              onRoleSubmit={(value) => setRoleMutation.mutateAsync(value)}
              user={editingUser}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};

type UserEditTabsProps = {
  canSetPassword: boolean;
  canSetRole: boolean;
  canUpdateProfile: boolean;
  isPasswordPending: boolean;
  isProfilePending: boolean;
  isRolePending: boolean;
  user: UserSummary;
  onPasswordSubmit: (value: UserPasswordFormValues) => Promise<unknown>;
  onProfileSubmit: (value: UserProfileFormValues) => Promise<unknown>;
  onRoleSubmit: (value: UserRoleFormValues) => Promise<unknown>;
};

const UserEditTabs: React.FC<UserEditTabsProps> = ({
  canSetPassword,
  canSetRole,
  canUpdateProfile,
  isPasswordPending,
  isProfilePending,
  isRolePending,
  onPasswordSubmit,
  onProfileSubmit,
  onRoleSubmit,
  user,
}) => {
  const defaultTab = canUpdateProfile ? "profile" : canSetRole ? "role" : "password";

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList className="w-full">
        {canUpdateProfile ? <TabsTrigger value="profile">Profile</TabsTrigger> : null}
        {canSetRole ? <TabsTrigger value="role">Role</TabsTrigger> : null}
        {canSetPassword ? <TabsTrigger value="password">Password</TabsTrigger> : null}
      </TabsList>
      {canUpdateProfile ? (
        <TabsContent value="profile">
          <UserProfileForm
            initialUser={user}
            isPending={isProfilePending}
            onSubmit={onProfileSubmit}
          />
        </TabsContent>
      ) : null}
      {canSetRole ? (
        <TabsContent value="role">
          <UserRoleForm initialUser={user} isPending={isRolePending} onSubmit={onRoleSubmit} />
        </TabsContent>
      ) : null}
      {canSetPassword ? (
        <TabsContent value="password">
          <UserPasswordForm isPending={isPasswordPending} onSubmit={onPasswordSubmit} />
        </TabsContent>
      ) : null}
    </Tabs>
  );
};

type AdminUserClient = {
  createUser: (input: {
    data: Pick<UserCreateFormValues, "emailVerified">;
    email: UserCreateFormValues["email"];
    name: UserCreateFormValues["name"];
    password: UserCreateFormValues["password"];
    role: UserCreateFormValues["role"];
  }) => Promise<unknown>;
  setRole: (input: { role: UserRoleFormValues["role"]; userId: string }) => Promise<unknown>;
  setUserPassword: (input: {
    newPassword: UserPasswordFormValues["newPassword"];
    userId: string;
  }) => Promise<unknown>;
  updateUser: (input: { data: UserProfileFormValues; userId: string }) => Promise<unknown>;
};

const adminUserClient = authClient.admin as unknown as AdminUserClient;

function unwrapAuthResult<TData>(result: unknown): TData {
  if (!isRecord(result)) {
    throw new Error("User update failed.");
  }

  if (isRecord(result.error)) {
    throw new Error(getAuthErrorMessage(result.error));
  }

  if (result.data === null || result.data === undefined) {
    throw new Error("User update failed.");
  }

  return result.data as TData;
}

function getAuthErrorMessage(error: Record<string, unknown>): string {
  return typeof error.message === "string" && error.message.length > 0
    ? error.message
    : "User update failed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
