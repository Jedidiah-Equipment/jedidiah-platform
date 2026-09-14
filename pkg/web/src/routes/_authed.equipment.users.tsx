import { createFileRoute } from '@tanstack/react-router';

import { equipmentUserAdminExtension } from '@/equipment/pages/users/user-admin-extension.js';
import { UsersPage } from '@/pages/users/UsersPage.js';

export const Route = createFileRoute('/_authed/equipment/users')({
  staticData: {
    pageLabel: 'Users',
  },
  component: EquipmentUsersRoute,
});

function EquipmentUsersRoute() {
  return <UsersPage business="equipment" extension={equipmentUserAdminExtension} />;
}
