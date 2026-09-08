import { createFileRoute } from '@tanstack/react-router';
import { WorkTypesPage } from '@/contracting/pages/directory/WorkTypesPage.js';
export const Route = createFileRoute('/_authed/contracting/work-types/')({
  component: WorkTypesPage,
  staticData: { pageLabel: 'Work types' },
});
