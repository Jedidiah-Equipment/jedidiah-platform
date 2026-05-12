import { APP_ROLES, AppRole, type UserSummary } from "@pkg/schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldIcon } from "lucide-react";
import type React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Separator } from "@/components/ui/separator.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { useAccess } from "@/hooks/use-access.js";
import { useTRPC } from "@/lib/trpc.js";

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
              Admin only
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          {usersQuery.error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {usersQuery.error.message}
            </div>
          ) : null}
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="w-56">Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usersQuery.isPending ? <UserSkeletonRows /> : null}
                {!usersQuery.isPending && usersQuery.data?.users.length === 0 ? (
                  <TableRow>
                    <TableCell className="h-24 text-center text-muted-foreground" colSpan={3}>
                      No users found.
                    </TableCell>
                  </TableRow>
                ) : null}
                {usersQuery.data?.users.map((user) => (
                  <UserRow
                    currentUserId={accessQuery.data?.userId}
                    isPending={setRoleMutation.isPending}
                    key={user.id}
                    onRoleChange={(role) =>
                      setRoleMutation.mutate({
                        role,
                        userId: user.id,
                      })
                    }
                    user={user}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

type UserRowProps = {
  currentUserId: string | undefined;
  isPending: boolean;
  user: UserSummary;
  onRoleChange: (role: AppRole) => void;
};

const UserRow: React.FC<UserRowProps> = ({ currentUserId, isPending, onRoleChange, user }) => {
  const isCurrentUser = currentUserId === user.id;

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          {user.name}
          {isCurrentUser ? <Badge variant="outline">You</Badge> : null}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground">{user.email}</TableCell>
      <TableCell>
        <Select
          disabled={isPending || isCurrentUser}
          onValueChange={(value) => onRoleChange(AppRole.parse(value))}
          value={user.role}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {APP_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {roleLabels[role]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
};

function UserSkeletonRows() {
  return skeletonRowKeys.map((key) => (
    <TableRow key={key}>
      <TableCell>
        <Skeleton className="h-5 w-40" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-56" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-8 w-full" />
      </TableCell>
    </TableRow>
  ));
}

const skeletonRowKeys = [
  "user-skeleton-1",
  "user-skeleton-2",
  "user-skeleton-3",
  "user-skeleton-4",
];

const roleLabels: Record<AppRole, string> = {
  admin: "Admin",
  "product-editor": "Product editor",
  "product-viewer": "Product viewer",
};
