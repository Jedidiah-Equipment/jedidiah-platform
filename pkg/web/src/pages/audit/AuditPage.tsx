import type { Business } from '@pkg/schema';
import type React from 'react';
import { AuditTable, createAuditTableStore } from '@/components/audit/AuditTable.js';
import type { AuditValueLabels } from '@/components/audit/audit-change-display.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';

const pageDescriptions = {
  contracting: 'Field-level log of changes to Contracting records',
  equipment: 'Field-level log of boundary-visible entity changes',
} as const satisfies Record<Business, string>;

const auditTableStores = {
  contracting: createAuditTableStore('contracting-audit-table'),
  equipment: createAuditTableStore('audit-table'),
} as const satisfies Record<Business, ReturnType<typeof createAuditTableStore>>;

type AuditPageProps = {
  business: Business;
  valueLabels?: AuditValueLabels | undefined;
};

/** One business's Audit Log; the same page serves both, told which business it stands in by its route. */
export const AuditPage: React.FC<AuditPageProps> = ({ business, valueLabels }) => (
  <PageLayout description={pageDescriptions[business]} title="Audit Log">
    <AuditTable business={business} store={auditTableStores[business]} valueLabels={valueLabels} />
  </PageLayout>
);
