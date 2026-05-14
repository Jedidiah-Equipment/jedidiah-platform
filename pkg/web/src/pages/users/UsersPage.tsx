import { hasPermission } from '@pkg/domain';
import type { UserSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { ShieldIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Separator } from '@/components/ui/separator.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { UserTable } from './components/UserTable.js';
import { UserCreateDialog } from './UserCreateDialog.js';
import { UserEditDialog } from './UserEditDialog.js';

const emptyUsers: UserSummary[] = [];

export const UsersPage: React.FC = () => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const canManageUsers =
    hasPermission(access, 'user:update') ||
    hasPermission(access, 'user:set-role') ||
    hasPermission(access, 'user:set-password');

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);

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
              <UserCreateDialog />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <UserTable
            currentUserId={access?.userId}
            errorMessage={usersQuery.error?.message}
            isLoading={usersQuery.isPending}
            onEditUser={canManageUsers ? setEditingUser : undefined}
            showEditActions={canManageUsers}
            users={usersQuery.data?.users ?? emptyUsers}
          />
        </CardContent>
      </Card>

      {editingUser ? <UserEditDialog user={editingUser} onClose={() => setEditingUser(null)} /> : null}
    </div>
  );
};
