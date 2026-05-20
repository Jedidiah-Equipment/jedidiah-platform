import type React from 'react';

import { ListPageLayout } from '@/components/page-layout/ListPageLayout.js';
import { AuditTable } from './components/AuditTable.js';

export const AuditPage: React.FC = () => (
  <ListPageLayout description="History" title="Audit Log">
    <AuditTable />
  </ListPageLayout>
);
