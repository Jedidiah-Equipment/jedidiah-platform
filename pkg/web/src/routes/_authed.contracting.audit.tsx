import { createFileRoute } from '@tanstack/react-router';

import { requireRoutePermission } from '@/lib/route-auth.js';
import { AuditPage } from '@/pages/audit/AuditPage.js';

export const Route = createFileRoute('/_authed/contracting/audit')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'contracting_audit:read'),
  staticData: {
    pageLabel: 'Audit Log',
  },
  component: ContractingAuditRoute,
});

function ContractingAuditRoute() {
  return <AuditPage business="contracting" />;
}
