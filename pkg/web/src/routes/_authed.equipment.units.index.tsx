import { createFileRoute } from '@tanstack/react-router';

import { UnitsPage } from '@/pages/units/UnitsPage.js';

export const Route = createFileRoute('/_authed/equipment/units/')({
  staticData: {
    pageLabel: 'Units',
  },
  component: UnitsPage,
});
