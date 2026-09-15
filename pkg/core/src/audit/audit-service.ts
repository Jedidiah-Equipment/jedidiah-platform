import { auditEvents, type Db, getSortOrder, user, withPagination } from '@pkg/db';
import {
  AUDIT_ENTITY_TYPES,
  AuditActor,
  type AuditActorsInput,
  type AuditChanges,
  AuditEvent,
  type AuditListInput,
  type AuditListResult,
  type Business,
  getNextCursor,
} from '@pkg/schema';
import { and, asc, eq, gte, inArray, lte, or, type SQL } from 'drizzle-orm';

import { userBusinessMembership } from '../users/user-service.js';

export async function listAuditEvents({ db, input }: { db: Db; input: AuditListInput }): Promise<AuditListResult> {
  const where = buildAuditListWhere(db, input);
  const orderBy = getSortOrder(auditEvents.occurredAt, input.sortDirection);
  const rowsQuery = withPagination(
    db
      .select({
        action: auditEvents.action,
        actorEmail: user.email,
        actorName: user.name,
        actorUserId: auditEvents.actorUserId,
        changes: auditEvents.changes,
        entityId: auditEvents.entityId,
        entityType: auditEvents.entityType,
        id: auditEvents.id,
        occurredAt: auditEvents.occurredAt,
        summary: auditEvents.summary,
      })
      .from(auditEvents)
      .leftJoin(user, eq(auditEvents.actorUserId, user.id))
      .where(where)
      .orderBy(orderBy, asc(auditEvents.id))
      .$dynamic(),
    input,
  );

  const [rows, total] = await Promise.all([rowsQuery, db.$count(auditEvents, where)]);
  const items = rows.map((row) =>
    AuditEvent.parse({
      ...row,
      changes: row.changes as AuditChanges | null,
      occurredAt: row.occurredAt.toISOString(),
    }),
  );

  return {
    items,
    nextCursor: getNextCursor({ count: items.length, cursor: input.cursor, total }),
    total,
  };
}

/** Everyone who has acted in a business's audit log, by name — the log's Actor filter options. */
export async function listAuditActors({ db, input }: { db: Db; input: AuditActorsInput }): Promise<AuditActor[]> {
  const rows = await db
    .selectDistinct({ email: user.email, id: user.id, name: user.name })
    .from(auditEvents)
    .innerJoin(user, eq(auditEvents.actorUserId, user.id))
    .where(businessAuditEvents(db, input.business))
    .orderBy(asc(user.name), asc(user.id));

  return rows.map((row) => AuditActor.parse(row));
}

/**
 * The rows a business's audit log owns (ADR 0016's attributability invariant): its own entity types,
 * and User events for the users its Users page lists, so a super-admin's appear in both.
 */
function businessAuditEvents(db: Db, business: Business): SQL {
  const businessMembers = db.select({ id: user.id }).from(user).where(userBusinessMembership(business));

  return or(
    inArray(auditEvents.entityType, AUDIT_ENTITY_TYPES[business]),
    and(inArray(auditEvents.entityType, AUDIT_ENTITY_TYPES.shared), inArray(auditEvents.entityId, businessMembers)),
  ) as SQL;
}

function buildAuditListWhere(db: Db, input: AuditListInput): SQL | undefined {
  const conditions: SQL[] = [businessAuditEvents(db, input.business)];

  if (input.filters.actorUserIds.length > 0) {
    conditions.push(inArray(auditEvents.actorUserId, input.filters.actorUserIds));
  }

  if (input.filters.entityIds.length > 0) {
    conditions.push(inArray(auditEvents.entityId, input.filters.entityIds));
  }

  if (input.filters.entityTypes.length > 0) {
    conditions.push(inArray(auditEvents.entityType, input.filters.entityTypes));
  }

  if (input.filters.occurredAtStart) {
    conditions.push(gte(auditEvents.occurredAt, new Date(input.filters.occurredAtStart)));
  }

  if (input.filters.occurredAtEnd) {
    conditions.push(lte(auditEvents.occurredAt, new Date(input.filters.occurredAtEnd)));
  }

  return and(...conditions);
}
