import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/jobs')({
  staticData: {
    pageLabel: 'Jobs',
  },
  component: JobsRoute,
});

function JobsRoute() {
  return <Outlet />;
}
