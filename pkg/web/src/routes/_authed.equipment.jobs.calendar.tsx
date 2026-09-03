import { createFileRoute } from '@tanstack/react-router';

import { JobCalendarPage } from '@/equipment/pages/job-calendar/JobCalendarPage.js';

export const Route = createFileRoute('/_authed/equipment/jobs/calendar')({
  staticData: {
    pageLabel: 'Job Calendar',
  },
  component: JobCalendarRoute,
});

function JobCalendarRoute() {
  return <JobCalendarPage />;
}
