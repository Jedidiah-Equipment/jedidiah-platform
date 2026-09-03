import { createFileRoute } from '@tanstack/react-router';

import { UnitsPage } from '@/equipment/pages/units/UnitsPage.js';

export const Route = createFileRoute('/_authed/equipment/units/')({
  staticData: {
    pageLabel: 'Units',
  },
  component: UnitsPage,
});
