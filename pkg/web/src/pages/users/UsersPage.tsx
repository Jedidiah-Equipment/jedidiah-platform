import type { AppRole } from "@pkg/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldIcon } from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import { Separator } from "@/components/ui/separator.js";
import { useAccess } from "@/hooks/use-access.js";
import { useTRPC } from "@/lib/trpc.js";
import { UserTable } from "./components/UserTable.js";

export const UsersPage: React.FC = () => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const accessQuery = useAccess();
  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const setRoleMutation = useMutation(
    trpc.users.setRole.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          queryClient.invalidateQueries(trpc.users.list.queryFilter()),
          queryClient.invalidateQueries(trpc.auth.access.queryFilter()),
        ]);
        toast.success("User role updated");
      },
      onError: (error) => {
        toast.error(error.message);
      },
    }),
  );
  const { isPending: isRoleUpdatePending, mutate: setRole } = setRoleMutation;
  const handleRoleChange = useCallback(
    (userId: string, role: AppRole) =>
      setRole({
        role,
        userId,
      }),
    [setRole],
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
            <Badge variant="secondary">
              <ShieldIcon data-icon="inline-start" />
              User access
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <UserTable
            currentUserId={accessQuery.data?.userId}
            errorMessage={usersQuery.error?.message}
            isLoading={usersQuery.isPending}
            isRoleUpdatePending={isRoleUpdatePending}
            onRoleChange={handleRoleChange}
            users={usersQuery.data?.users ?? []}
          />
        </CardContent>
      </Card>
    </div>
  );
};
