import { createFileRoute } from '@tanstack/react-router';

import { equipmentAuditValueLabels } from '@/equipment/components/audit/EquipmentAuditTable.js';
import { requireRoutePermission } from '@/lib/route-auth.js';
import { AuditPage } from '@/pages/audit/AuditPage.js';

export const Route = createFileRoute('/_authed/equipment/audit')({
  beforeLoad: ({ context }) => requireRoutePermission(context, 'equipment_audit:read'),
  staticData: {
    pageLabel: 'Audit Log',
  },
  component: EquipmentAuditRoute,
});

function EquipmentAuditRoute() {
  return <AuditPage business="equipment" valueLabels={equipmentAuditValueLabels} />;
}
