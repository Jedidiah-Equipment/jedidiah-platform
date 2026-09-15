import { quoteDeliveryTermsLabels } from '@pkg/domain/equipment';
import type React from 'react';
import { AuditTable, createAuditTableStore } from '@/components/audit/AuditTable.js';
import type { AuditValueLabels } from '@/components/audit/audit-change-display.js';

export const equipmentAuditValueLabels = {
  deliveryTerms: quoteDeliveryTermsLabels,
} as const satisfies AuditValueLabels;

export const useQuoteAuditTableStore = createAuditTableStore('quote-audit-table');
export const usePurchaseOrderAuditTableStore = createAuditTableStore('purchase-order-audit-table');
export const useProductAuditTableStore = createAuditTableStore('product-audit-table');
export const useCustomerAuditTableStore = createAuditTableStore('customer-audit-table');
export const useSupplierAuditTableStore = createAuditTableStore('supplier-audit-table');

type EquipmentAuditTableProps = Omit<React.ComponentProps<typeof AuditTable>, 'business' | 'valueLabels'>;

export const EquipmentAuditTable: React.FC<EquipmentAuditTableProps> = (props) => (
  <AuditTable business="equipment" valueLabels={equipmentAuditValueLabels} {...props} />
);
