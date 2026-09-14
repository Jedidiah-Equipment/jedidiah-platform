import { createFileRoute } from '@tanstack/react-router';
import { requireRoutePermission } from '@/lib/route-auth.js';
import { UsersPage } from '@/pages/users/UsersPage.js';
import { noUserAdminExtension } from '@/pages/users/user-admin-extension.js';

export const Route = createFileRoute('/_authed/contracting/users')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'user:list'),
  staticData: {
    pageLabel: 'Users',
  },
  component: ContractingUsersRoute,
});

function ContractingUsersRoute() {
  return <UsersPage business="contracting" extension={noUserAdminExtension} />;
}
