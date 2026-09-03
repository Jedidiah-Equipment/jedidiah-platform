import { createFileRoute } from '@tanstack/react-router';

import { AuditPage } from '@/pages/audit/AuditPage.js';

export const Route = createFileRoute('/_authed/audit')({
  staticData: {
    pageLabel: 'Audit Log',
  },
  component: AuditPage,
});
