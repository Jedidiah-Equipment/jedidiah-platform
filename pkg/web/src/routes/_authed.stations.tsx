import { createFileRoute } from '@tanstack/react-router';

import { StationsPage } from '@/pages/stations/StationsPage.js';

export const Route = createFileRoute('/_authed/stations')({
  staticData: {
    pageLabel: 'Stations',
  },
  component: StationsPage,
});
