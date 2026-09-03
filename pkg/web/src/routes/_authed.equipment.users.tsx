import { createFileRoute } from '@tanstack/react-router';

import { UsersPage } from '@/equipment/pages/users/UsersPage.js';

export const Route = createFileRoute('/_authed/equipment/users')({
  staticData: {
    pageLabel: 'Users',
  },
  component: UsersPage,
});
