import { hasPermission } from "@pkg/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useAccess } from "@/hooks/use-access.js";
import { authClient } from "@/lib/auth-client.js";
import { useTRPC } from "@/lib/trpc.js";
import { UserCreateForm, type UserCreateFormValues } from "./components/UserCreateForm.js";
import { unwrapAuthResult } from "./user-admin-client.js";

export const UserCreateDialog: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const [isOpen, setIsOpen] = useState(false);

  const createUserMutation = useMutation({
    mutationFn: async (value: UserCreateFormValues) =>
      unwrapAuthResult(
        await authClient.admin.createUser({
          data: { emailVerified: value.emailVerified },
          email: value.email,
          name: value.name,
          password: value.password,
          role: value.role,
        }),
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries(trpc.users.list.queryFilter()),
        queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
      ]);
      setIsOpen(false);
      toast.success("User created");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (!hasPermission(accessQuery.data, "user:create")) {
    return null;
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <PlusIcon data-icon="inline-start" />
        New user
      </Button>
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New user</DialogTitle>
            <DialogDescription>Create a user with email/password access.</DialogDescription>
          </DialogHeader>
          {isOpen ? (
            <UserCreateForm
              isPending={createUserMutation.isPending}
              onSubmit={(value) => createUserMutation.mutateAsync(value)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
};
