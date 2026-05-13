import type { Database } from "@pkg/db";
import { withPagination } from "@pkg/db/query-utils";
import { auditEvents, user } from "@pkg/db/schema";
import type {
  AuditAction,
  AuditChanges,
  AuditEntityType,
  AuditEvent,
  AuditListInput,
  AuditListResult,
} from "@pkg/schema";
import { and, asc, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type AuditWriteDatabase = Pick<Database | DatabaseTransaction, "insert">;

type AuditRecord = Record<string, unknown>;

type AuditEntityDescriptor = {
  entityType: AuditEntityType;
  noun: string;
  primaryLabelField: string;
  fields: Record<string, string>;
};

type CreateAuditSummaryInput = {
  action: AuditAction;
  changes: AuditChanges | null;
  entityType: AuditEntityType;
  before?: AuditRecord | null;
  after?: AuditRecord | null;
};

type InsertAuditEventInput = CreateAuditSummaryInput & {
  actorUserId: string | null;
  entityId: string;
};

export const productAuditDescriptor = {
  entityType: "product",
  noun: "product",
  primaryLabelField: "name",
  fields: {
    basePrice: "base price",
    currencyCode: "currency",
    description: "description",
    modelCode: "model code",
    name: "name",
  },
} as const satisfies AuditEntityDescriptor;

const auditEntityDescriptors = {
  product: productAuditDescriptor,
} as const satisfies Record<AuditEntityType, AuditEntityDescriptor>;

type AuditEventRow = typeof auditEvents.$inferSelect & {
  actorName: string | null;
  actorEmail: string | null;
};

export function createAuditChanges<TRecord extends AuditRecord>(
  before: TRecord,
  after: TRecord,
  fields: Record<string, string>,
): AuditChanges | null {
  const changes: AuditChanges = {};

  for (const field of Object.keys(fields)) {
    const from = toAuditValue(before[field]);
    const to = toAuditValue(after[field]);

    if (!Object.is(from, to)) {
      changes[field] = { from, to };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function createAuditSummary(input: CreateAuditSummaryInput): string {
  const descriptor = getAuditEntityDescriptor(input.entityType);

  if (input.action === "created") {
    return `Created ${descriptor.noun} ${quoteLabel(getEntityLabel(descriptor, input.after))}`;
  }

  if (input.action === "deleted") {
    return `Deleted ${descriptor.noun} ${quoteLabel(getEntityLabel(descriptor, input.before))}`;
  }

  const primaryFieldChange = input.changes?.[descriptor.primaryLabelField];
  if (primaryFieldChange) {
    return `Renamed ${descriptor.noun} ${quoteLabel(primaryFieldChange.from)} to ${quoteLabel(
      primaryFieldChange.to,
    )}`;
  }

  return `Updated ${descriptor.noun} ${quoteLabel(
    getEntityLabel(descriptor, input.after ?? input.before),
  )}`;
}

export async function insertAuditEvent(
  database: AuditWriteDatabase,
  input: InsertAuditEventInput,
): Promise<void> {
  await database.insert(auditEvents).values({
    action: input.action,
    actorUserId: input.actorUserId,
    changes: input.changes,
    entityId: input.entityId,
    entityType: input.entityType,
    summary: createAuditSummary(input),
  });
}

export async function listAuditEvents(
  database: Database,
  input: AuditListInput,
): Promise<AuditListResult> {
  const where = buildAuditListWhere(input);
  const sortColumn = auditEvents.occurredAt;
  const orderBy = input.sortDirection === "asc" ? asc(sortColumn) : desc(sortColumn);
  const rowsQuery = withPagination(
    database
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
      .orderBy(orderBy)
      .$dynamic(),
    input,
  );

  const [rows, total] = await Promise.all([rowsQuery, database.$count(auditEvents, where)]);

  return {
    items: rows.map(mapAuditEvent),
    sortBy: input.sortBy,
    sortDirection: input.sortDirection,
    total,
  };
}

function buildAuditListWhere(input: AuditListInput): SQL | undefined {
  const conditions: SQL[] = [];

  if (input.filters.actorUserIds.length > 0) {
    conditions.push(inArray(auditEvents.actorUserId, input.filters.actorUserIds));
  }

  if (input.filters.entityTypes.length > 0) {
    conditions.push(inArray(auditEvents.entityType, input.filters.entityTypes));
  }

  if (input.filters.occurredAtStart) {
    conditions.push(gte(auditEvents.occurredAt, input.filters.occurredAtStart));
  }

  if (input.filters.occurredAtEnd) {
    conditions.push(lte(auditEvents.occurredAt, input.filters.occurredAtEnd));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return {
    action: row.action as AuditAction,
    actorEmail: row.actorEmail,
    actorName: row.actorName,
    actorUserId: row.actorUserId,
    changes: row.changes as AuditChanges | null,
    entityId: row.entityId,
    entityType: row.entityType as AuditEntityType,
    id: row.id,
    occurredAt: row.occurredAt,
    summary: row.summary,
  };
}

function getAuditEntityDescriptor(entityType: AuditEntityType): AuditEntityDescriptor {
  return auditEntityDescriptors[entityType];
}

function getEntityLabel(
  descriptor: AuditEntityDescriptor,
  record: AuditRecord | null | undefined,
): unknown {
  return record?.[descriptor.primaryLabelField] ?? "Unknown";
}

function quoteLabel(value: unknown): string {
  return `"${String(value)}"`;
}

function toAuditValue(value: unknown): unknown | null {
  return value === undefined ? null : value;
}
