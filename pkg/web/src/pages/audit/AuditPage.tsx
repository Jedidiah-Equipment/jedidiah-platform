import type React from 'react';

import { AuditTable, useAuditTableStore } from '@/components/audit/AuditTable.js';
import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';

export const AuditPage: React.FC = () => (
  <ListPageLayout description="History" title="Audit Log">
    <AuditTable store={useAuditTableStore} />
  </ListPageLayout>
);
