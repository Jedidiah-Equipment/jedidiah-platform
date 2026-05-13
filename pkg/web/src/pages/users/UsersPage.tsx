import { UserCreateInput, type UserSummary, UserUpdateInput } from "@pkg/schema";
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
import { useAccess, useCan } from "@/hooks/use-access.js";
import { useTRPC } from "@/lib/trpc.js";
import { UserForm } from "./components/UserForm.js";
import { UserTable } from "./components/UserTable.js";

const emptyUsers: UserSummary[] = [];

export const UsersPage: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const canEditUsers = useCan("user:edit").can;
  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);

  const createUserMutation = useMutation(
    trpc.users.create.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.users.list.queryFilter()),
          queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
        ]);
        setIsCreateOpen(false);
        toast.success("User created");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

  const updateUserMutation = useMutation(
    trpc.users.update.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.users.list.queryFilter()),
          queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
        ]);
        setEditingUser(null);
        toast.success("User updated");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );

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
              {canEditUsers ? (
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
            onEditUser={canEditUsers ? setEditingUser : undefined}
            showEditActions={canEditUsers}
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
            <UserForm
              isPending={createUserMutation.isPending}
              onSubmit={(value) => createUserMutation.mutateAsync(UserCreateInput.parse(value))}
              submitLabel="Create user"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(isOpen) => !isOpen && setEditingUser(null)} open={!!editingUser}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update profile, role, and credential details.</DialogDescription>
          </DialogHeader>
          {editingUser ? (
            <UserForm
              initialUser={editingUser}
              isPending={updateUserMutation.isPending}
              key={editingUser.id}
              onSubmit={(value) => updateUserMutation.mutateAsync(UserUpdateInput.parse(value))}
              submitLabel="Save user"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
};
