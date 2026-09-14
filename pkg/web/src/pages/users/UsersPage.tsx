import { hasPermission } from '@pkg/domain';
import type { Business, UserAccount } from '@pkg/schema';
import type React from 'react';
import { useState } from 'react';

import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useAccess } from '@/hooks/use-access.js';
import { PermissionMatrix } from './components/PermissionMatrix.js';
import { UserTable } from './components/UserTable.js';
import { UserCreateDialog } from './UserCreateDialog.js';
import { UserEditDialog } from './UserEditDialog.js';
import type { UserAdminExtension } from './user-admin-extension.js';

const pageDescriptions = {
  contracting: 'Sign-in accounts, Drivers and Mechanics, and their Contracting roles',
  equipment: 'Sign-in accounts with Equipment roles and department assignments',
} as const satisfies Record<Business, string>;

type UsersPageProps = {
  business: Business;
  extension: UserAdminExtension;
};

/**
 * One business's user admin. Each business lists the users holding a role in it and edits only
 * that role slot; the same page serves both, told which business it stands in by its route.
 */
export const UsersPage: React.FC<UsersPageProps> = ({ business, extension }) => {
  const accessQuery = useAccess();
  const access = accessQuery.data;
  const canManageUsers =
    hasPermission(access, 'user:update') ||
    hasPermission(access, 'user:set-email') ||
    hasPermission(access, 'user:set-role') ||
    hasPermission(access, 'user:set-password');

  const tableExtension = extension.useTableExtension();
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);

  return (
    <>
      <PageLayout
        actions={<UserCreateDialog business={business} extension={extension} />}
        description={pageDescriptions[business]}
        size="lg"
        title="Users"
      >
        <Tabs defaultValue="users" size="sm">
          <TabsList variant="default">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="permissions">Permission Matrix</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-4" value="users">
            <UserTable
              business={business}
              currentUserId={access?.userId}
              extraColumns={tableExtension.columns}
              useListQuery={extension.useListQuery}
              onEditUser={canManageUsers ? setEditingUser : undefined}
            />
          </TabsContent>
          <TabsContent className="pt-4" value="permissions">
            <PermissionMatrix business={business} />
          </TabsContent>
        </Tabs>
      </PageLayout>

      {editingUser ? (
        <UserEditDialog
          business={business}
          extension={extension}
          onClose={() => setEditingUser(null)}
          user={editingUser}
        />
      ) : null}
    </>
  );
};
