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
import { and, asc, eq, exists, gte, inArray, isNotNull, isNull, lte, notInArray, or, type SQL, sql } from 'drizzle-orm';

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

export async function listAuditActors({ db, input }: { db: Db; input: AuditActorsInput }): Promise<AuditActor[]> {
  // Probing each User through `audit_actor_idx` scales with the user count; a distinct join over the
  // log scans every event the business owns.
  const actedInBusiness = db
    .select({ acted: sql`1` })
    .from(auditEvents)
    .where(and(eq(auditEvents.actorUserId, user.id), businessAuditEvents(db, input.business)));
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(exists(actedInBusiness))
    .orderBy(asc(user.name), asc(user.id));

  return rows.map((row) => AuditActor.parse(row));
}

/**
 * The rows a business's audit log owns (ADR 0016's attributability invariant): its own entity types,
 * plus the User events attributed to it. Nearly every audited User fact is an Equipment one (Department
 * Membership, the shared device flag, Job Activity), so a User event is Contracting's only when the User
 * holds a Contracting role and no Equipment role; every other one — a super-admin's, a role-less or
 * removed User's — stays with Equipment, and no event shows in both logs.
 */
function businessAuditEvents(db: Db, business: Business): SQL {
  const contractingOnlyUsers = db
    .select({ id: user.id })
    .from(user)
    .where(and(isNotNull(user.contractingRole), isNull(user.role)));
  const attributedUsers =
    business === 'contracting'
      ? inArray(auditEvents.entityId, contractingOnlyUsers)
      : notInArray(auditEvents.entityId, contractingOnlyUsers);

  return or(
    inArray(auditEvents.entityType, AUDIT_ENTITY_TYPES[business]),
    and(inArray(auditEvents.entityType, AUDIT_ENTITY_TYPES.shared), attributedUsers),
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
