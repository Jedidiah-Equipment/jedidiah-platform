import { hasPermission } from '@pkg/domain';
import type { UserSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { ShieldIcon } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
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
    hasPermission(access, 'user:set-password') ||
    hasPermission(access, 'user:assign-departments');

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);

  return (
    <>
      <ListPageLayout
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              <ShieldIcon data-icon="inline-start" />
              User access
            </Badge>
            <UserCreateDialog />
          </div>
        }
        description="Access"
        title="Users"
      >
        <UserTable
          currentUserId={access?.userId}
          errorMessage={getApiQueryErrorMessage(usersQuery.error, 'Unable to load users.')}
          isLoading={usersQuery.isPending}
          onEditUser={canManageUsers ? setEditingUser : undefined}
          showEditActions={canManageUsers}
          users={usersQuery.data?.users ?? emptyUsers}
        />
      </ListPageLayout>

      {editingUser ? <UserEditDialog user={editingUser} onClose={() => setEditingUser(null)} /> : null}
    </>
  );
};
