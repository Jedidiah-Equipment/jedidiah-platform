import { z } from 'zod';
import { AUDIT_ENTITY_TYPES, AuditEvent } from '../audit/audit.js';
import { createCursorQueryResult } from '../common/pagination.js';
export const EquipmentAuditEntityType = z.enum(AUDIT_ENTITY_TYPES.equipment);
export type EquipmentAuditEntityType = z.infer<typeof EquipmentAuditEntityType>;
/** The Equipment audit list only ever returns Equipment entity types; the type says so. */
export const EquipmentAuditEvent = AuditEvent.extend({ entityType: EquipmentAuditEntityType });
export type EquipmentAuditEvent = z.infer<typeof EquipmentAuditEvent>;
export const EquipmentAuditListResult = createCursorQueryResult(EquipmentAuditEvent);
export type EquipmentAuditListResult = z.infer<typeof EquipmentAuditListResult>;
