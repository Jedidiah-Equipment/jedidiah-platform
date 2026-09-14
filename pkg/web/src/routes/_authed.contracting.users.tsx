import { createFileRoute } from '@tanstack/react-router';
import { UsersPage } from '@/pages/users/UsersPage.js';
import { noUserAdminExtension } from '@/pages/users/user-admin-extension.js';

export const Route = createFileRoute('/_authed/contracting/users')({
  staticData: {
    pageLabel: 'Users',
  },
  component: ContractingUsersRoute,
});

function ContractingUsersRoute() {
  return <UsersPage business="contracting" extension={noUserAdminExtension} />;
}
