import { createFileRoute } from '@tanstack/react-router';

import { JobCalendarPage } from '@/pages/job-calendar/JobCalendarPage.js';

export const Route = createFileRoute('/_authed/jobs/calendar')({
  staticData: {
    pageLabel: 'Job Calendar',
  },
  component: JobCalendarRoute,
});

function JobCalendarRoute() {
  return <JobCalendarPage />;
}
