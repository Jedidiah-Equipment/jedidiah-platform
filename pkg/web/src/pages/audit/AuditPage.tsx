import type React from 'react';

import { AuditTable, useAuditTableStore } from '@/components/audit/AuditTable.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';

export const AuditPage: React.FC = () => (
  <PageLayout description="History" title="Audit Log">
    <AuditTable store={useAuditTableStore} />
  </PageLayout>
);
