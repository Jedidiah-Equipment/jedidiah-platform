import { createFileRoute } from '@tanstack/react-router';

import { JobCalendarPage } from '@/pages/jobs/JobCalendarPage.js';

export const Route = createFileRoute('/_authed/jobs/calendar')({
  staticData: {
    pageLabel: 'Job Calendar',
  },
  component: JobCalendarRoute,
});

function JobCalendarRoute() {
  return <JobCalendarPage />;
}
