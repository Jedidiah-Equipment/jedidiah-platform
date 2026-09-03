import type React from 'react';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { AuditTable, useAuditTableStore } from '@/equipment/components/audit/AuditTable.js';
import { auditPageDescription } from '@/equipment/utils/page-descriptions.js';

export const AuditPage: React.FC = () => (
  <PageLayout description={auditPageDescription} title="Audit Log">
    <AuditTable store={useAuditTableStore} />
  </PageLayout>
);
