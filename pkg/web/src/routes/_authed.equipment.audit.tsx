import { createFileRoute } from '@tanstack/react-router';

import { AuditPage } from '@/pages/audit/AuditPage.js';

export const Route = createFileRoute('/_authed/equipment/audit')({
  staticData: {
    pageLabel: 'Audit Log',
  },
  component: AuditPage,
});
