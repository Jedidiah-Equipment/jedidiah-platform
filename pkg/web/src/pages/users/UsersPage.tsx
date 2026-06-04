import { hasPermission } from '@pkg/domain';
import type { UserSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
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
      <ListPageLayout action={<UserCreateDialog />} description="Access" title="Users">
        <UserTable
          currentUserId={access?.userId}
          errorMessage={getApiQueryErrorMessage(usersQuery.error, 'Unable to load users.')}
          isLoading={usersQuery.isPending}
          onEditUser={canManageUsers ? setEditingUser : undefined}
          users={usersQuery.data?.users ?? emptyUsers}
        />
      </ListPageLayout>

      {editingUser ? <UserEditDialog user={editingUser} onClose={() => setEditingUser(null)} /> : null}
    </>
  );
};
