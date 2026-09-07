import { z } from 'zod';

import { AuthId } from '../auth/auth-id.js';
import { DateIso } from '../common/date.js';
import { createCursorQueryResult, createSortedCursorQueryInput } from '../common/pagination.js';
import { UUID } from '../common/uuid.js';

export type AuditAction = z.infer<typeof AuditAction>;
export const AuditAction = z.enum(['created', 'updated', 'deleted', 'merged']);

// One registry assigns every audited entity to its business; the full enum and business views
// derive from it, so a new type cannot silently disappear from a separately maintained subset.
export const AUDIT_ENTITY_TYPES = {
  contracting: ['contracting_category', 'contracting_machine', 'contracting_implement'],
  equipment: [
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
  ],
} as const;
export type AuditEntityType = z.infer<typeof AuditEntityType>;
export const AuditEntityType = z.enum([...AUDIT_ENTITY_TYPES.contracting, ...AUDIT_ENTITY_TYPES.equipment]);

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
    filters: AuditFilters,
  },
  sortBy: AuditSortBy.default('occurredAt'),
});

export type AuditListResult = z.infer<typeof AuditListResult>;
export const AuditListResult = createCursorQueryResult(AuditEvent);
