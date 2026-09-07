import { AuditEntityType } from '../audit/audit.js';

export const EquipmentAuditEntityType = AuditEntityType.extract([
  'customer',
  'document',
  'job',
  'job_bay',
  'part',
  'product',
  'product_unit',
  'purchase_order',
  'quote',
  'supplier',
  'user',
]);
