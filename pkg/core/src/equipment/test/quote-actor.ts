import { accessForRole } from '@pkg/domain/testing';
import type { EquipmentRole } from '@pkg/schema';

/** A Quote reader or writer as the API edge would build one; a Super Administrator unless a test says otherwise. */
export const testQuoteActor = (userId: string, role: EquipmentRole = 'super-admin') => accessForRole(role, userId);
