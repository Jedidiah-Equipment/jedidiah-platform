import { createFileRoute } from '@tanstack/react-router';

import { ContractingHomePage } from '@/contracting/pages/ContractingHomePage.js';

export const Route = createFileRoute('/_authed/contracting/')({
  staticData: {
    pageLabel: 'Contracting',
  },
  component: ContractingHomePage,
});
