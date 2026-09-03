import type React from 'react';

import { AuditTable, useAuditTableStore } from '@/components/audit/AuditTable.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { auditPageDescription } from '@/utils/page-descriptions.js';

export const AuditPage: React.FC = () => (
  <PageLayout description={auditPageDescription} title="Audit Log">
    <AuditTable store={useAuditTableStore} />
  </PageLayout>
);
