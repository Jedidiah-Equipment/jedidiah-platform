import { hasPermission } from '@pkg/domain';
import type { UserSummary } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { usersPageDescription } from '@/equipment/utils/page-descriptions.js';
import { useAccess } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { PermissionMatrix } from './components/PermissionMatrix.js';
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
    hasPermission(access, 'user:set-email') ||
    hasPermission(access, 'user:set-role') ||
    hasPermission(access, 'user:set-password');

  const usersQuery = useQuery(trpc.users.list.queryOptions());
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);

  return (
    <>
      <PageLayout actions={<UserCreateDialog />} description={usersPageDescription} size="lg" title="Users">
        <Tabs defaultValue="users" size="sm">
          <TabsList variant="default">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="users">
            <UserTable
              currentUserId={access?.userId}
              errorMessage={getApiQueryErrorMessage(usersQuery.error, 'Unable to load users.')}
              isLoading={usersQuery.isPending}
              onEditUser={canManageUsers ? setEditingUser : undefined}
              users={usersQuery.data?.users ?? emptyUsers}
            />
          </TabsContent>
          <TabsContent className="pt-4" value="permissions">
            <PermissionMatrix />
          </TabsContent>
        </Tabs>
      </PageLayout>

      {editingUser ? <UserEditDialog user={editingUser} onClose={() => setEditingUser(null)} /> : null}
    </>
  );
};
