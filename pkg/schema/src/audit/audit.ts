import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { Business } from '../common/business.js';
import { DateIso } from '../common/date.js';
import { createCursorQueryResult, createSortedCursorQueryInput } from '../common/pagination.js';
import { UUID } from '../common/uuid.js';

export type AuditAction = z.infer<typeof AuditAction>;
export const AuditAction = z.enum(['created', 'updated', 'deleted', 'merged']);

// One registry assigns every audited entity to its business; the full enum and business views
// derive from it, so a new type cannot silently disappear from a separately maintained subset.
// A shared type belongs to no business by type alone: its events are attributed through the record
// (a User through its role slots) and shown in each business that record belongs to.
export const AUDIT_ENTITY_TYPES = {
  contracting: [
    'contracting_work_type',
    'contracting_farm',
    'contracting_customer',
    'contracting_category',
    'contracting_machine',
    'contracting_implement',
    'contracting_reading',
  ],
  equipment: [
    'customer',
    'document',
    'job',
    'job_bay',
    'labor_rate_card',
    'part',
    'product',
    'product_unit',
    'purchase_order',
    'quote',
    'supplier',
  ],
  shared: ['user'],
} as const;
export type AuditEntityType = z.infer<typeof AuditEntityType>;
export const AuditEntityType = z.enum([
  ...AUDIT_ENTITY_TYPES.contracting,
  ...AUDIT_ENTITY_TYPES.equipment,
  ...AUDIT_ENTITY_TYPES.shared,
]);

/** The entity types a business's audit log can show: its own and the shared ones. */
export function getBusinessAuditEntityTypes(business: Business): AuditEntityType[] {
  return [...AUDIT_ENTITY_TYPES[business], ...AUDIT_ENTITY_TYPES.shared];
}

export type AuditFieldChange = z.infer<typeof AuditFieldChange>;
export const AuditFieldChange = z.object({
  from: z.unknown().nullable(),
  to: z.unknown().nullable(),
});

export type AuditChanges = z.infer<typeof AuditChanges>;
export const AuditChanges = z.record(z.string(), AuditFieldChange);

export type AuditEvent = z.infer<typeof AuditEvent>;
export const AuditEvent = z.object({
  id: UUID,
  occurredAt: DateIso,
  actorUserId: AuthId.nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.email().nullable(),
  entityType: AuditEntityType,
  entityId: z.string().trim().min(1),
  action: AuditAction,
  summary: z.string().min(1),
  changes: AuditChanges.nullable(),
});

export type AuditSortBy = z.infer<typeof AuditSortBy>;
export const AuditSortBy = z.enum(['occurredAt']);

export type AuditFilters = z.infer<typeof AuditFilters>;
export const AuditFilters = z
  .object({
    actorUserIds: z.array(AuthId).default([]),
    entityIds: z.array(z.string().trim().min(1)).default([]),
    entityTypes: z.array(AuditEntityType).default([]),
    occurredAtStart: DateIso.optional(),
    occurredAtEnd: DateIso.optional(),
  })
  .default({
    actorUserIds: [],
    entityIds: [],
    entityTypes: [],
  });

export type AuditListInput = z.infer<typeof AuditListInput>;
export const AuditListInput = createSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    business: Business,
    filters: AuditFilters,
  },
  sortBy: AuditSortBy.default('occurredAt'),
});

export type AuditListResult = z.infer<typeof AuditListResult>;
export const AuditListResult = createCursorQueryResult(AuditEvent);

export type AuditActorsInput = z.infer<typeof AuditActorsInput>;
export const AuditActorsInput = z.object({ business: Business });

/** Someone who has acted in a business's audit log, for its Actor filter. */
export type AuditActor = z.infer<typeof AuditActor>;
export const AuditActor = z.object({
  email: z.email(),
  id: AuthId,
  name: z.string(),
});
