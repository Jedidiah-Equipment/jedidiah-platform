import { z } from 'zod';
import { AUDIT_ENTITY_TYPES } from '../audit/audit.js';
export const EquipmentAuditEntityType = z.enum(AUDIT_ENTITY_TYPES.equipment);
