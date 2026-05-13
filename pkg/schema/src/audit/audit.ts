import { z } from "zod";

import { AuthId } from "../auth/auth-id.js";
import { SortDirection } from "../common/sort.js";
import { UUID } from "../common/uuid.js";
import { createPagedQueryResult, PagedQueryInput } from "../pagination/pagination.js";

export type AuditAction = z.infer<typeof AuditAction>;
export const AuditAction = z.enum(["created", "updated", "deleted"]);

export type AuditEntityType = z.infer<typeof AuditEntityType>;
export const AuditEntityType = z.enum(["product"]);

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
  occurredAt: z.coerce.date(),
  actorUserId: AuthId.nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.email().nullable(),
  entityType: AuditEntityType,
  entityId: UUID,
  action: AuditAction,
  summary: z.string().min(1),
  changes: AuditChanges.nullable(),
});

export type AuditSortBy = z.infer<typeof AuditSortBy>;
export const AuditSortBy = z.enum(["occurredAt"]);

export type AuditFilters = z.infer<typeof AuditFilters>;
export const AuditFilters = z
  .object({
    actorUserIds: z.array(AuthId).default([]),
    entityTypes: z.array(AuditEntityType).default([]),
    occurredAtStart: z.coerce.date().optional(),
    occurredAtEnd: z.coerce.date().optional(),
  })
  .default({
    actorUserIds: [],
    entityTypes: [],
  });

export type AuditListInput = z.infer<typeof AuditListInput>;
export const AuditListInput = PagedQueryInput.extend({
  filters: AuditFilters,
  sortBy: AuditSortBy.default("occurredAt"),
  sortDirection: SortDirection.default("desc"),
});

export type AuditListResult = z.infer<typeof AuditListResult>;
export const AuditListResult = createPagedQueryResult(AuditEvent).extend({
  sortBy: AuditSortBy,
  sortDirection: SortDirection,
});
