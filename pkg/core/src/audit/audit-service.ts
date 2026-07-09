import { auditEvents, type DatabaseTransaction, type Db, getSortOrder, user, withPagination } from '@pkg/db';
import type { AuditAction, AuditChanges, AuditEntityType, AuditListInput, AuditListResult } from '@pkg/schema';
import { AuditEvent } from '@pkg/schema';
import { and, eq, gte, inArray, lte, type SQL } from 'drizzle-orm';

export type AuditRecord = Record<string, unknown>;

/**
 * Everything the audit engine needs to summarize an entity, independent of how its audited record is
 * projected. The user-departments membership delta hands a hand-built record straight to
 * {@link recordAuditEvent}, so it only needs this much.
 */
export type AuditSummaryDescriptor = {
  entityType: AuditEntityType;
  noun: string;
  primaryLabelField: string;
  primaryLabelFormatter?: (value: unknown) => string;
};

// One element of an audited child collection. `key` is the stable matching identity (an id where one
// exists), `label` names the element in the change set (omit it when unknown — the diff falls back to
// the counterpart element's label, then the key), `value` is the audited projection. Descriptors must
// pre-sort/normalize `value` so JSON.stringify equality is order-stable.
export type AuditCollectionElement = { key: string; label?: string | undefined; value: unknown };
// Field prefix -> elements; each changed element records as `${prefix}:${label}`.
export type AuditCollections = Record<string, AuditCollectionElement[]>;

/**
 * A feature owns its descriptor and defines it next to its service. `toRecord` projects the aggregate
 * (row plus any related collections) into the audited record; the audited field set is exactly the
 * record's keys — there is no separate field list to keep in sync. `entityId` derives the audited
 * entity id from the same input. The engine stays generic over {@link AuditRecord} and depends on no
 * aggregate type; the dependency points feature -> audit, never the reverse.
 */
export type AuditDescriptor<TInput> = AuditSummaryDescriptor & {
  toRecord: (input: TInput) => AuditRecord;
  // Optional child collections diffed element-wise by `key`: only elements that changed are recorded,
  // each as its own `${prefix}:${label}` entry with structured from/to values, instead of folding the
  // whole collection into one field of `toRecord`.
  toCollections?: (input: TInput) => AuditCollections;
  entityId: (input: TInput) => string;
  // Optional when the summary label is not itself an audited field (e.g. a Job's code or a User's
  // email): keeps the label out of `toRecord` so it never pollutes the change set. Defaults to
  // reading `primaryLabelField` from the projected record.
  label?: (input: TInput) => unknown;
};

export function defineAuditDescriptor<TInput>(descriptor: AuditDescriptor<TInput>): AuditDescriptor<TInput> {
  return descriptor;
}

type AuditEventRow = typeof auditEvents.$inferSelect & {
  actorName: string | null;
  actorEmail: string | null;
};

/**
 * The concentrated diff-and-skip rule: the audited field set is the projected record's own keys.
 * Returns the changed fields, or `null` when nothing audited changed so the caller can skip the write.
 */
export function diffAuditRecords(before: AuditRecord, after: AuditRecord): AuditChanges | null {
  const changes: AuditChanges = {};

  for (const field of Object.keys(after)) {
    const from = toAuditValue(before[field]);
    const to = toAuditValue(after[field]);

    if (!Object.is(from, to)) {
      changes[field] = { from, to };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

export function diffAuditUpdate<TInput>(
  descriptor: AuditDescriptor<TInput>,
  before: TInput,
  after: TInput,
): AuditChanges | null {
  const changes = {
    ...diffAuditRecords(descriptor.toRecord(before), descriptor.toRecord(after)),
    ...diffAuditCollections(descriptor.toCollections?.(before) ?? {}, descriptor.toCollections?.(after) ?? {}),
  };

  return Object.keys(changes).length > 0 ? changes : null;
}

// Elements sharing a key (collections without a stable id) are paired in array order; unpaired
// leftovers record as additions/removals.
function diffAuditCollections(before: AuditCollections, after: AuditCollections): AuditChanges {
  const changes: AuditChanges = {};

  for (const prefix of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const unmatched = groupCollectionElementsByKey(before[prefix] ?? []);

    for (const element of after[prefix] ?? []) {
      const match = unmatched.get(element.key)?.shift();
      const label = element.label ?? match?.label ?? element.key;

      if (!match) {
        addCollectionChange(changes, prefix, label, { from: null, to: toAuditValue(element.value) });
      } else if (JSON.stringify(match.value) !== JSON.stringify(element.value)) {
        addCollectionChange(changes, prefix, label, {
          from: toAuditValue(match.value),
          to: toAuditValue(element.value),
        });
      }
    }

    for (const leftovers of unmatched.values()) {
      for (const element of leftovers) {
        addCollectionChange(changes, prefix, element.label ?? element.key, {
          from: toAuditValue(element.value),
          to: null,
        });
      }
    }
  }

  return changes;
}

function groupCollectionElementsByKey(elements: AuditCollectionElement[]): Map<string, AuditCollectionElement[]> {
  const groups = new Map<string, AuditCollectionElement[]>();

  for (const element of elements) {
    const group = groups.get(element.key);

    if (group) {
      group.push(element);
    } else {
      groups.set(element.key, [element]);
    }
  }

  return groups;
}

function addCollectionChange(changes: AuditChanges, prefix: string, label: string, change: AuditChanges[string]): void {
  const base = `${prefix}:${label}`;
  let key = base;

  for (let ordinal = 2; key in changes; ordinal += 1) {
    key = `${base} (${ordinal})`;
  }

  changes[key] = change;
}

function snapshotAuditChanges(record: AuditRecord, action: Extract<AuditAction, 'created' | 'deleted'>): AuditChanges {
  const changes: AuditChanges = {};

  for (const field of Object.keys(record)) {
    const value = toAuditValue(record[field]);

    changes[field] = action === 'created' ? { from: null, to: value } : { from: value, to: null };
  }

  return changes;
}

function snapshotAuditCollections(
  collections: AuditCollections,
  action: Extract<AuditAction, 'created' | 'deleted'>,
): AuditChanges {
  const changes: AuditChanges = {};

  for (const [prefix, elements] of Object.entries(collections)) {
    for (const element of elements) {
      const value = toAuditValue(element.value);

      addCollectionChange(
        changes,
        prefix,
        element.label ?? element.key,
        action === 'created' ? { from: null, to: value } : { from: value, to: null },
      );
    }
  }

  return changes;
}

export function buildAuditSummary(
  descriptor: AuditSummaryDescriptor,
  action: AuditAction,
  changes: AuditChanges | null,
  label: unknown,
): string {
  if (action === 'created') {
    return `Created ${descriptor.noun} ${quoteLabel(formatEntityLabel(descriptor, label ?? 'Unknown'))}`;
  }

  if (action === 'deleted') {
    return `Deleted ${descriptor.noun} ${quoteLabel(formatEntityLabel(descriptor, label ?? 'Unknown'))}`;
  }

  const primaryFieldChange = changes?.[descriptor.primaryLabelField];
  if (primaryFieldChange) {
    return `Renamed ${descriptor.noun} ${quoteLabel(formatEntityLabel(descriptor, primaryFieldChange.from))} to ${quoteLabel(formatEntityLabel(descriptor, primaryFieldChange.to))}`;
  }

  return `Updated ${descriptor.noun} ${quoteLabel(formatEntityLabel(descriptor, label ?? 'Unknown'))}`;
}

/**
 * Low-level emitter. Inserts one audit event from an already-projected record and (where applicable)
 * already-computed changes. Use the {@link recordAuditCreate}/{@link recordAuditUpdate}/
 * {@link recordAuditDelete} helpers for the standard row-diff path; reach for this only when the
 * changes are not a field diff (e.g. user department membership add/remove).
 */
async function insertAuditRow({
  db,
  descriptor,
  action,
  actorUserId,
  entityId,
  changes,
  label,
}: {
  db: DatabaseTransaction;
  descriptor: AuditSummaryDescriptor;
  action: AuditAction;
  actorUserId: string | null;
  entityId: string;
  changes: AuditChanges | null;
  label: unknown;
}): Promise<void> {
  await db.insert(auditEvents).values({
    action,
    actorUserId,
    changes,
    entityId,
    entityType: descriptor.entityType,
    summary: buildAuditSummary(descriptor, action, changes, label),
  });
}

function recordLabel<TInput>(descriptor: AuditDescriptor<TInput>, input: TInput, record: AuditRecord): unknown {
  return descriptor.label ? descriptor.label(input) : record[descriptor.primaryLabelField];
}

export async function recordAuditEvent({
  db,
  descriptor,
  action,
  actorUserId,
  entityId,
  changes,
  record,
}: {
  db: DatabaseTransaction;
  descriptor: AuditSummaryDescriptor;
  action: AuditAction;
  actorUserId: string | null;
  entityId: string;
  changes: AuditChanges | null;
  record: AuditRecord;
}): Promise<void> {
  await insertAuditRow({
    db,
    descriptor,
    action,
    actorUserId,
    entityId,
    changes,
    label: record[descriptor.primaryLabelField],
  });
}

export async function recordAuditCreate<TInput>({
  db,
  descriptor,
  actorUserId,
  input,
}: {
  db: DatabaseTransaction;
  descriptor: AuditDescriptor<TInput>;
  actorUserId: string | null;
  input: TInput;
}): Promise<void> {
  const record = descriptor.toRecord(input);

  await insertAuditRow({
    db,
    descriptor,
    action: 'created',
    actorUserId,
    entityId: descriptor.entityId(input),
    changes: {
      ...snapshotAuditChanges(record, 'created'),
      ...snapshotAuditCollections(descriptor.toCollections?.(input) ?? {}, 'created'),
    },
    label: recordLabel(descriptor, input, record),
  });
}

export async function recordAuditDelete<TInput>({
  db,
  descriptor,
  actorUserId,
  input,
}: {
  db: DatabaseTransaction;
  descriptor: AuditDescriptor<TInput>;
  actorUserId: string | null;
  input: TInput;
}): Promise<void> {
  const record = descriptor.toRecord(input);

  await insertAuditRow({
    db,
    descriptor,
    action: 'deleted',
    actorUserId,
    entityId: descriptor.entityId(input),
    changes: {
      ...snapshotAuditChanges(record, 'deleted'),
      ...snapshotAuditCollections(descriptor.toCollections?.(input) ?? {}, 'deleted'),
    },
    label: recordLabel(descriptor, input, record),
  });
}

/**
 * Emit the update event. The caller computes `changes` first (via {@link diffAuditUpdate}) so it can
 * run its own control flow between the diff and the write — the skip-on-no-change branch and, for
 * Quotes, the Locked Quote gate that reads the changed field set.
 */
export async function recordAuditUpdate<TInput>({
  db,
  descriptor,
  actorUserId,
  after,
  changes,
}: {
  db: DatabaseTransaction;
  descriptor: AuditDescriptor<TInput>;
  actorUserId: string | null;
  after: TInput;
  changes: AuditChanges;
}): Promise<void> {
  await insertAuditRow({
    db,
    descriptor,
    action: 'updated',
    actorUserId,
    entityId: descriptor.entityId(after),
    changes,
    label: recordLabel(descriptor, after, descriptor.toRecord(after)),
  });
}

export async function listAuditEvents({ db, input }: { db: Db; input: AuditListInput }): Promise<AuditListResult> {
  const where = buildAuditListWhere(input);
  const sortColumn = auditEvents.occurredAt;
  const orderBy = getSortOrder(sortColumn, input.sortDirection);
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
      .orderBy(orderBy)
      .$dynamic(),
    input,
  );

  const [rows, total] = await Promise.all([rowsQuery, db.$count(auditEvents, where)]);

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

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function mapAuditEvent(row: AuditEventRow): AuditEvent {
  return AuditEvent.parse({
    action: row.action as AuditAction,
    actorEmail: row.actorEmail,
    actorName: row.actorName,
    actorUserId: row.actorUserId,
    changes: row.changes as AuditChanges | null,
    entityId: row.entityId,
    entityType: row.entityType as AuditEntityType,
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    summary: row.summary,
  });
}

function formatEntityLabel(descriptor: AuditSummaryDescriptor, value: unknown): string {
  return descriptor.primaryLabelFormatter?.(value) ?? String(value);
}

function quoteLabel(value: string): string {
  return `"${value}"`;
}

function toAuditValue(value: unknown): unknown | null {
  return value === undefined ? null : value;
}
